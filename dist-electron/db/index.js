"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
exports.getDb = getDb;
exports.setupDatabaseIPC = setupDatabaseIPC;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
let _db = null;
function sha256(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
function nowIso() {
    return new Date().toISOString();
}
function applySchema(db, schemaPath) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const statements = sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
        if (/^PRAGMA\s+journal_mode/i.test(stmt) || /^PRAGMA\s+foreign_keys/i.test(stmt)) {
            continue;
        }
        try {
            db.exec(stmt + ';');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('already exists') && !msg.includes('duplicate column name')) {
                console.error('[db] Schema statement failed:', stmt.slice(0, 120));
                throw err;
            }
        }
    }
}
function seedDefaults(db) {
    const profileCount = db.prepare('SELECT COUNT(*) AS c FROM profiles').get().c;
    if (profileCount === 0) {
        const adminId = crypto.randomUUID();
        const pinHash = sha256('0000');
        const now = nowIso();
        db.prepare(`INSERT INTO profiles (id, username, full_name, is_active, pin_hash, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`).run(adminId, 'admin', 'المدير', pinHash, now, now);
        db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`).run(crypto.randomUUID(), adminId);
        console.log('[db] Default admin seeded (username: admin, PIN: 0000)');
    }
    const settingsCount = db.prepare("SELECT COUNT(*) AS c FROM business_settings WHERE id = 'default'").get().c;
    if (settingsCount === 0) {
        const now = nowIso();
        db.prepare(`INSERT INTO business_settings (id, created_at, updated_at) VALUES ('default', ?, ?)`).run(now, now);
        console.log('[db] Default business_settings seeded.');
    }
}
function initializeDatabase() {
    if (_db)
        return _db;
    const dbPath = path.join(electron_1.app.getPath('userData'), 'data.db');
    console.log('[db] Opening:', dbPath);
    const db = new better_sqlite3_1.default(dbPath);
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
function getDb() {
    if (!_db)
        throw new Error('[db] Not initialized. Call initializeDatabase() first.');
    return _db;
}
function setupDatabaseIPC() {
    initializeDatabase();
    electron_1.ipcMain.handle('db:query', (_event, sql, params) => {
        try {
            const rows = getDb().prepare(sql).all(params ?? []);
            return { data: rows, error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[db:query]', message, '\nSQL:', sql);
            return { data: null, error: message };
        }
    });
    electron_1.ipcMain.handle('db:run', (_event, sql, params) => {
        try {
            const result = getDb().prepare(sql).run(params ?? []);
            return { data: { changes: result.changes, lastInsertRowid: result.lastInsertRowid }, error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[db:run]', message, '\nSQL:', sql);
            return { data: null, error: message };
        }
    });
    electron_1.ipcMain.handle('db:transaction', (_event, operations) => {
        try {
            const db = getDb();
            const runTx = db.transaction((ops) => {
                const results = [];
                for (const op of ops) {
                    const stmt = db.prepare(op.sql);
                    if (op.sql.trimStart().toUpperCase().startsWith('SELECT')) {
                        results.push(stmt.all(op.params ?? []));
                    }
                    else {
                        const r = stmt.run(op.params ?? []);
                        results.push({ changes: r.changes, lastInsertRowid: r.lastInsertRowid });
                    }
                }
                return results;
            });
            return { data: runTx(operations), error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[db:transaction]', message);
            return { data: null, error: message };
        }
    });
}
