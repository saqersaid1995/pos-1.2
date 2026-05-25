const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const { ipcMain, app } = require('electron') as typeof import('electron');
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const crypto = require('crypto') as typeof import('crypto');

// ─────────────────────────────────────────
// Module-level singleton
// ─────────────────────────────────────────
let _db: import('better-sqlite3').Database | null = null;

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Run the schema SQL file against the database.
 * The file is split on ";\n" so that multi-line trigger bodies are kept intact,
 * then each non-empty statement is executed individually.
 */
function applySchema(db: import('better-sqlite3').Database, schemaPath: string): void {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Split on semicolon followed by a newline (preserves trigger BEGIN…END blocks)
  const statements = sql
    .split(/;\s*\n/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    if (/^PRAGMA\s+journal_mode/i.test(stmt) || /^PRAGMA\s+foreign_keys/i.test(stmt)) {
      continue;
    }
    try {
      db.exec(stmt + ';');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !msg.includes('already exists') &&
        !msg.includes('duplicate column name')
      ) {
        console.error('[db] Failed to execute schema statement:', stmt.slice(0, 120));
        throw err;
      }
    }
  }
}

/**
 * Seed the database with the default admin user and business_settings row
 * if none exist yet.
 */
function seedDefaults(db: import('better-sqlite3').Database): void {
  const profileCount = (
    db.prepare('SELECT COUNT(*) AS c FROM profiles').get() as { c: number }
  ).c;

  if (profileCount === 0) {
    const adminId = crypto.randomUUID();
    const pinHash = sha256('0000');
    const now = nowIso();

    db.prepare(
      `INSERT INTO profiles (id, username, full_name, is_active, pin_hash, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).run(adminId, 'admin', 'المدير', pinHash, now, now);

    db.prepare(
      `INSERT INTO user_roles (id, user_id, role)
       VALUES (?, ?, 'admin')`
    ).run(crypto.randomUUID(), adminId);

    console.log('[db] Default admin user seeded.');
  }

  const settingsCount = (
    db.prepare("SELECT COUNT(*) AS c FROM business_settings WHERE id = 'default'").get() as {
      c: number;
    }
  ).c;

  if (settingsCount === 0) {
    const now = nowIso();
    db.prepare(
      `INSERT INTO business_settings (id, created_at, updated_at)
       VALUES ('default', ?, ?)`
    ).run(now, now);

    console.log('[db] Default business_settings row seeded.');
  }
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * Opens (or creates) the SQLite database, applies the schema, and seeds
 * default data. Calling this more than once returns the same instance.
 */
function initializeDatabase(): import('better-sqlite3').Database {
  if (_db) return _db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'data.db');

  console.log('[db] Opening database at:', dbPath);

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  applySchema(db, schemaPath);

  const migrationName = 'initial_schema';
  const alreadyApplied = db
    .prepare('SELECT 1 FROM _migrations WHERE name = ?')
    .get(migrationName);

  if (!alreadyApplied) {
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      migrationName,
      nowIso()
    );
  }

  seedDefaults(db);

  _db = db;
  console.log('[db] Database ready.');
  return db;
}

/**
 * Returns the active Database instance.
 * Throws if initializeDatabase() has not been called yet.
 */
function getDb(): import('better-sqlite3').Database {
  if (!_db) {
    throw new Error('[db] Database has not been initialized. Call initializeDatabase() first.');
  }
  return _db;
}

// ─────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────

/**
 * Initializes the database and registers three IPC channels:
 *
 *  db:query       – SELECT-style queries, returns { data: rows[], error }
 *  db:run         – INSERT / UPDATE / DELETE, returns { data: {changes, lastInsertRowid}, error }
 *  db:transaction – Array of {sql, params} executed atomically; returns { data: results[], error }
 */
function setupDatabaseIPC(): void {
  initializeDatabase();

  // ── db:query ────────────────────────────
  ipcMain.handle(
    'db:query',
    (
      _event: Electron.IpcMainInvokeEvent,
      sql: string,
      params?: unknown[]
    ): { data: unknown[] | null; error: string | null } => {
      try {
        const db = getDb();
        const rows = db.prepare(sql).all(params ?? []);
        return { data: rows, error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[db:query] Error:', message, '\nSQL:', sql);
        return { data: null, error: message };
      }
    }
  );

  // ── db:run ──────────────────────────────
  ipcMain.handle(
    'db:run',
    (
      _event: Electron.IpcMainInvokeEvent,
      sql: string,
      params?: unknown[]
    ): {
      data: { changes: number; lastInsertRowid: number | bigint } | null;
      error: string | null;
    } => {
      try {
        const db = getDb();
        const result = db.prepare(sql).run(params ?? []);
        return {
          data: {
            changes: result.changes,
            lastInsertRowid: result.lastInsertRowid,
          },
          error: null,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[db:run] Error:', message, '\nSQL:', sql);
        return { data: null, error: message };
      }
    }
  );

  // ── db:transaction ──────────────────────
  ipcMain.handle(
    'db:transaction',
    (
      _event: Electron.IpcMainInvokeEvent,
      operations: Array<{ sql: string; params?: unknown[] }>
    ): { data: unknown[] | null; error: string | null } => {
      try {
        const db = getDb();

        const runTransaction = db.transaction(
          (ops: Array<{ sql: string; params?: unknown[] }>) => {
            const results: unknown[] = [];
            for (const op of ops) {
              const stmt = db.prepare(op.sql);
              const trimmed = op.sql.trimStart().toUpperCase();
              if (trimmed.startsWith('SELECT')) {
                results.push(stmt.all(op.params ?? []));
              } else {
                const result = stmt.run(op.params ?? []);
                results.push({
                  changes: result.changes,
                  lastInsertRowid: result.lastInsertRowid,
                });
              }
            }
            return results;
          }
        );

        const results = runTransaction(operations);
        return { data: results, error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[db:transaction] Error:', message);
        return { data: null, error: message };
      }
    }
  );
}

module.exports = { setupDatabaseIPC, initializeDatabase, getDb };
