import Database from 'better-sqlite3';
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

type DB = Database.Database;

let _db: DB | null = null;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function applySchema(db: DB, schemaPath: string): void {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  // Use db.exec() for the whole file — SQLite's native parser handles comments,
  // multi-statement triggers (BEGIN…END), and IF NOT EXISTS idempotency correctly.
  db.exec(sql);
}

function seedDefaults(db: DB): void {
  const profileCount = (db.prepare('SELECT COUNT(*) AS c FROM profiles').get() as { c: number }).c;

  if (profileCount === 0) {
    const adminId = crypto.randomUUID();
    const pinHash = sha256('0000');
    const now = nowIso();

    db.prepare(
      `INSERT INTO profiles (id, username, full_name, is_active, pin_hash, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).run(adminId, 'admin', 'المدير', pinHash, now, now);

    db.prepare(
      `INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`
    ).run(crypto.randomUUID(), adminId);

    console.log('[db] Default admin seeded (username: admin, PIN: 0000)');
  }

  const settingsCount = (
    db.prepare("SELECT COUNT(*) AS c FROM business_settings WHERE id = 'default'").get() as { c: number }
  ).c;

  if (settingsCount === 0) {
    const now = nowIso();
    db.prepare(`INSERT INTO business_settings (id, created_at, updated_at) VALUES ('default', ?, ?)`).run(now, now);
    console.log('[db] Default business_settings seeded.');
  }
}

export function initializeDatabase(): DB {
  if (_db) return _db;

  const dbPath = path.join(app.getPath('userData'), 'data.db');
  console.log('[db] Opening:', dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  applySchema(db, schemaPath);

  const migrationName = 'initial_schema';
  if (!db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migrationName)) {
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(migrationName, nowIso());
  }

  seedDefaults(db);
  _db = db;
  console.log('[db] Ready.');
  return db;
}

export function getDb(): DB {
  if (!_db) throw new Error('[db] Not initialized. Call initializeDatabase() first.');
  return _db;
}

export function setupDatabaseIPC(): void {
  initializeDatabase();

  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    try {
      const rows = getDb().prepare(sql).all(params ?? []);
      return { data: rows, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[db:query]', message, '\nSQL:', sql);
      return { data: null, error: message };
    }
  });

  ipcMain.handle('db:run', (_event, sql: string, params?: unknown[]) => {
    try {
      const result = getDb().prepare(sql).run(params ?? []);
      return { data: { changes: result.changes, lastInsertRowid: result.lastInsertRowid }, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[db:run]', message, '\nSQL:', sql);
      return { data: null, error: message };
    }
  });

  ipcMain.handle('db:transaction', (_event, operations: Array<{ sql: string; params?: unknown[] }>) => {
    try {
      const db = getDb();
      const runTx = db.transaction((ops: typeof operations) => {
        const results: unknown[] = [];
        for (const op of ops) {
          const stmt = db.prepare(op.sql);
          if (op.sql.trimStart().toUpperCase().startsWith('SELECT')) {
            results.push(stmt.all(op.params ?? []));
          } else {
            const r = stmt.run(op.params ?? []);
            results.push({ changes: r.changes, lastInsertRowid: r.lastInsertRowid });
          }
        }
        return results;
      });
      return { data: runTx(operations), error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[db:transaction]', message);
      return { data: null, error: message };
    }
  });
}
