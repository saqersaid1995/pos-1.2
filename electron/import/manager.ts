import Database from 'better-sqlite3';
import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDb } from '../db/index';

// Delete order matters because of foreign keys
const DELETE_ORDER = [
  'loyalty_transactions', 'customer_loyalty',
  'loan_payments', 'loan_installments', 'loans',
  'expense_payments', 'expenses',
  'journal_entry_lines', 'journal_entries',
  'cash_transactions',
  'payments', 'order_status_history', 'internal_order_notes', 'order_items',
  'orders', 'customers',
  'service_pricing', 'services', 'items',
  'user_roles',
  'complaints', 'fixed_assets', 'cash_accounts',
  'chart_of_accounts',
];

export interface AnalyzeResult {
  type: 'json' | 'sqlite' | 'unknown';
  version?: string;
  exportedAt?: string;
  tables: { name: string; rowCount: number }[];
  warnings: string[];
  fileSizeBytes: number;
}

export interface ImportOptions {
  mode: 'replace' | 'merge' | 'add-only';
  conflictResolution: 'newer-wins' | 'imported-wins' | 'local-wins';
}

export interface ImportProgress {
  status: 'running' | 'done' | 'error' | 'cancelled';
  table?: string;
  tablesTotal: number;
  tablesDone: number;
  rowsTotal: number;
  rowsDone: number;
  errors: string[];
  message?: string;
}

let cancelFlag = false;

function toSqlValue(v: unknown): unknown {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function analyzeFile(filePath: string): AnalyzeResult {
  const stat = fs.statSync(filePath);
  const fileSizeBytes = stat.size;

  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json') || lower.includes('.drovo.json')) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const tables = data.tables as Record<string, unknown[]> | undefined;
      if (!tables) return { type: 'unknown', tables: [], warnings: ['Missing "tables" key in JSON'], fileSizeBytes };
      const tableList = Object.entries(tables).map(([name, rows]) => ({
        name,
        rowCount: Array.isArray(rows) ? rows.length : 0,
      }));
      return {
        type: 'json',
        version: typeof data.version === 'string' ? data.version : undefined,
        exportedAt: typeof data.exported_at === 'string' ? data.exported_at : undefined,
        tables: tableList,
        warnings: [],
        fileSizeBytes,
      };
    } catch (e) {
      return { type: 'unknown', tables: [], warnings: [`JSON parse error: ${String(e)}`], fileSizeBytes };
    }
  }

  if (lower.endsWith('.db')) {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(16);
      const read = fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (read < 16 || buf.slice(0, 15).toString() !== 'SQLite format 3') {
        return { type: 'unknown', tables: [], warnings: ['Not a valid SQLite file'], fileSizeBytes };
      }
      const src = new Database(filePath, { readonly: true });
      const tbls = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations'").all() as { name: string }[];
      const tableList = tbls.map((t) => {
        try {
          const c = (src.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get() as { c: number }).c;
          return { name: t.name, rowCount: c };
        } catch { return { name: t.name, rowCount: 0 }; }
      });
      src.close();
      return { type: 'sqlite', tables: tableList, warnings: [], fileSizeBytes };
    } catch (e) {
      return { type: 'unknown', tables: [], warnings: [`SQLite error: ${String(e)}`], fileSizeBytes };
    }
  }

  return { type: 'unknown', tables: [], warnings: ['Unsupported file format (.json or .db only)'], fileSizeBytes };
}

function getLocalCols(tableName: string): string[] {
  try {
    const db = getDb();
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as { name: string }[];
    return rows.map((r) => r.name);
  } catch { return []; }
}

function clearLocalData(db: Database.Database): void {
  const tx = db.transaction(() => {
    for (const t of DELETE_ORDER) {
      try { db.prepare(`DELETE FROM "${t}"`).run(); } catch { /* table may not exist */ }
    }
  });
  tx();
}

async function importFromJson(
  filePath: string,
  options: ImportOptions,
  mainWindow: BrowserWindow,
): Promise<ImportProgress> {
  cancelFlag = false;
  const db = getDb();

  const send = (p: Partial<ImportProgress>) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('import:progress', p);
  };

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as { tables: Record<string, unknown[]> };
    const tables = data.tables ?? {};
    const tableNames = Object.keys(tables);
    const rowsTotal = tableNames.reduce((s, t) => s + (tables[t]?.length ?? 0), 0);
    const errors: string[] = [];
    let rowsDone = 0;
    let tablesDone = 0;

    if (options.mode === 'replace') clearLocalData(db);

    for (const tableName of tableNames) {
      if (cancelFlag) break;
      send({ status: 'running', table: tableName, tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors });

      const localCols = getLocalCols(tableName);
      if (localCols.length === 0) {
        errors.push(`جدول "${tableName}" غير موجود — تم التخطي`);
        tablesDone++;
        continue;
      }

      const rows = tables[tableName] ?? [];
      const CHUNK = 50;
      for (let i = 0; i < rows.length; i += CHUNK) {
        if (cancelFlag) break;
        const chunk = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
        try {
          const tx = db.transaction((chunkRows: Record<string, unknown>[]) => {
            for (const rawRow of chunkRows) {
              const row: Record<string, unknown> = {};
              for (const col of localCols) {
                if (col in rawRow) row[col] = toSqlValue(rawRow[col]);
              }
              if (!row['id']) row['id'] = crypto.randomUUID();

              const keys = Object.keys(row);
              const cols = keys.map((k) => `"${k}"`).join(', ');
              const placeholders = keys.map(() => '?').join(', ');
              const vals = keys.map((k) => row[k]);

              const verb =
                options.mode === 'replace' ? 'INSERT OR REPLACE' :
                options.mode === 'merge' && options.conflictResolution !== 'local-wins' ? 'INSERT OR REPLACE' :
                'INSERT OR IGNORE';

              db.prepare(`${verb} INTO "${tableName}" (${cols}) VALUES (${placeholders})`).run(vals);
            }
          });
          tx(chunk);
          rowsDone += chunk.length;
          send({ status: 'running', table: tableName, tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors });
        } catch (e) {
          errors.push(`${tableName}[${i}]: ${String(e)}`);
        }
      }
      tablesDone++;
    }

    const final: ImportProgress = {
      status: cancelFlag ? 'cancelled' : 'done',
      tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors,
      message: cancelFlag
        ? 'تم إلغاء الاستيراد'
        : `تم استيراد ${rowsDone} سجل في ${tablesDone} جدول`,
    };
    send(final);
    return final;
  } catch (e) {
    const prog: ImportProgress = { status: 'error', tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0, errors: [String(e)], message: `فشل الاستيراد: ${String(e)}` };
    send(prog);
    return prog;
  }
}

async function importFromSQLite(
  filePath: string,
  options: ImportOptions,
  mainWindow: BrowserWindow,
): Promise<ImportProgress> {
  cancelFlag = false;
  const db = getDb();
  const send = (p: Partial<ImportProgress>) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('import:progress', p);
  };

  try {
    const src = new Database(filePath, { readonly: true });
    const tbls = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations'").all() as { name: string }[];
    const tableNames = tbls.map((t) => t.name);
    const rowsTotal = tableNames.reduce((s, t) => {
      try { return s + (src.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c; }
      catch { return s; }
    }, 0);

    const errors: string[] = [];
    let rowsDone = 0;
    let tablesDone = 0;

    if (options.mode === 'replace') clearLocalData(db);

    for (const tableName of tableNames) {
      if (cancelFlag) break;
      send({ status: 'running', table: tableName, tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors });

      const localCols = getLocalCols(tableName);
      if (localCols.length === 0) {
        errors.push(`جدول "${tableName}" غير موجود — تم التخطي`);
        tablesDone++;
        continue;
      }

      const total = (src.prepare(`SELECT COUNT(*) AS c FROM "${tableName}"`).get() as { c: number }).c;
      const CHUNK = 100;
      for (let offset = 0; offset < total; offset += CHUNK) {
        if (cancelFlag) break;
        const chunk = src.prepare(`SELECT * FROM "${tableName}" LIMIT ${CHUNK} OFFSET ${offset}`).all() as Record<string, unknown>[];
        try {
          const tx = db.transaction((rows: Record<string, unknown>[]) => {
            for (const rawRow of rows) {
              const row: Record<string, unknown> = {};
              for (const col of localCols) {
                if (col in rawRow) row[col] = rawRow[col];
              }
              const keys = Object.keys(row);
              if (keys.length === 0) continue;
              const cols = keys.map((k) => `"${k}"`).join(', ');
              const placeholders = keys.map(() => '?').join(', ');
              const vals = keys.map((k) => row[k]);

              const verb =
                options.mode === 'replace' ? 'INSERT OR REPLACE' :
                options.mode === 'merge' && options.conflictResolution !== 'local-wins' ? 'INSERT OR REPLACE' :
                'INSERT OR IGNORE';

              db.prepare(`${verb} INTO "${tableName}" (${cols}) VALUES (${placeholders})`).run(vals);
            }
          });
          tx(chunk);
          rowsDone += chunk.length;
          send({ status: 'running', table: tableName, tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors });
        } catch (e) {
          errors.push(`${tableName}[${offset}]: ${String(e)}`);
        }
      }
      tablesDone++;
    }

    src.close();
    const final: ImportProgress = {
      status: cancelFlag ? 'cancelled' : 'done',
      tablesTotal: tableNames.length, tablesDone, rowsTotal, rowsDone, errors,
      message: cancelFlag ? 'تم إلغاء الاستيراد' : `تم استيراد ${rowsDone} سجل في ${tablesDone} جدول`,
    };
    send(final);
    return final;
  } catch (e) {
    const prog: ImportProgress = { status: 'error', tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0, errors: [String(e)], message: `فشل الاستيراد: ${String(e)}` };
    send(prog);
    return prog;
  }
}

export function setupImportIPC(mainWindow: BrowserWindow): void {
  ipcMain.handle('import:analyze', (_event, filePath: string) => {
    try {
      return { data: analyzeFile(filePath), error: null };
    } catch (e) {
      return { data: null, error: String(e) };
    }
  });

  ipcMain.handle('import:start', (_event, filePath: string, options: ImportOptions) => {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.db')) {
      return importFromSQLite(filePath, options, mainWindow);
    }
    return importFromJson(filePath, options, mainWindow);
  });

  ipcMain.handle('import:cancel', () => {
    cancelFlag = true;
    return { success: true };
  });
}
