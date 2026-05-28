import Database from 'better-sqlite3';
import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import { getDb } from '../db/index';

// FK-safe deletion order (only tables that exist in the local schema)
const DELETE_ORDER = [
  'loyalty_transactions', 'customer_loyalty',
  'loan_payments', 'loan_installments', 'loans',
  'expense_payments', 'expenses',
  'journal_entry_lines', 'journal_entries',
  'cash_transfers',
  'payments', 'payment_corrections', 'order_status_history', 'internal_order_notes', 'order_items',
  'orders', 'customer_notes', 'customers',
  'service_pricing', 'services', 'items',
  'user_roles', 'profiles',
  'complaints', 'depreciation_entries', 'fixed_assets',
  'opening_balances', 'notification_logs',
  'chart_of_accounts', 'accounting_settings',
  'business_settings',
];

// Supabase table name → SQLite table name aliases
const TABLE_MAP: Record<string, string> = {
  customers: 'customers',
  orders: 'orders',
  order_items: 'order_items',
  payments: 'payments',
  order_status_history: 'order_status_history',
  internal_order_notes: 'internal_order_notes',
  customer_notes: 'customer_notes',
  items: 'items',
  services: 'services',
  service_pricing: 'service_pricing',
  expenses: 'expenses',
  expense_payments: 'expense_payments',
  chart_of_accounts: 'chart_of_accounts',
  accounting_settings: 'accounting_settings',
  journal_entries: 'journal_entries',
  journal_entry_lines: 'journal_entry_lines',
  fixed_assets: 'fixed_assets',
  depreciation_entries: 'depreciation_entries',
  opening_balances: 'opening_balances',
  loans: 'loans',
  loan_payments: 'loan_payments',
  loan_installments: 'loan_installments',
  cash_transfers: 'cash_transfers',
  // Supabase uses "cash_accounts" as a table name in some setups
  cash_accounts: 'cash_transfers',
  loyalty_settings: 'loyalty_settings',
  customer_loyalty: 'customer_loyalty',
  loyalty_transactions: 'loyalty_transactions',
  profiles: 'profiles',
  user_roles: 'user_roles',
  complaints: 'complaints',
  business_settings: 'business_settings',
  notification_logs: 'notification_logs',
  payment_corrections: 'payment_corrections',
  // Common Supabase name variants
  item_types: 'items',
  service_types: 'services',
  services_pricing: 'service_pricing',
  cash_transactions: 'cash_transfers',  // Supabase may use this name
  order_notes: 'internal_order_notes',
  loan_installment_payments: 'loan_payments',
};

export interface AnalyzeResult {
  type: 'json' | 'sqlite' | 'csv' | 'zip' | 'unknown';
  version?: string;
  exportedAt?: string;
  tables: { name: string; rowCount: number }[];
  warnings: string[];
  fileSizeBytes: number;
  detectedTable?: string; // for CSV files
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
  skippedCols?: string[];
}

export interface CsvImportResult {
  tableName: string;
  imported: number;
  skipped: number;
  errors: string[];
  skippedCols: string[];
}

export interface ZipImportResult {
  tables: { tableName: string; imported: number; skipped: number }[];
  errors: string[];
}

let cancelFlag = false;

function toSqlValue(v: unknown): unknown {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function fromCsvValue(val: string | undefined | null): unknown {
  if (val === '' || val === undefined || val === null) return null;
  if (val === 'true') return 1;
  if (val === 'false') return 0;
  return val;
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

function resolveTableName(rawName: string): string {
  return TABLE_MAP[rawName] ?? rawName;
}

function countCsvLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Count non-empty lines minus the header line
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return Math.max(0, lines.length - 1);
  } catch { return 0; }
}

function analyzeFile(filePath: string): AnalyzeResult {
  const stat = fs.statSync(filePath);
  const fileSizeBytes = stat.size;
  const lower = filePath.toLowerCase();

  // CSV
  if (lower.endsWith('.csv')) {
    const baseName = path.basename(filePath, '.csv');
    const detectedTable = resolveTableName(baseName);
    const rowCount = countCsvLines(filePath);
    return {
      type: 'csv',
      tables: [{ name: detectedTable, rowCount }],
      warnings: [],
      fileSizeBytes,
      detectedTable,
    };
  }

  // ZIP
  if (lower.endsWith('.zip')) {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries().filter(
        (e) => e.entryName.endsWith('.csv') && !e.isDirectory,
      );
      const tables = entries.map((e) => {
        const base = path.basename(e.entryName, '.csv');
        const tName = resolveTableName(base);
        // Rough row count from entry size (avg ~100 bytes/row)
        const rowCount = Math.max(0, Math.floor(e.header.size / 100));
        return { name: tName, rowCount };
      });
      return { type: 'zip', tables, warnings: [], fileSizeBytes };
    } catch (e) {
      return { type: 'unknown', tables: [], warnings: [`ZIP error: ${String(e)}`], fileSizeBytes };
    }
  }

  // JSON
  if (lower.endsWith('.json') || lower.includes('.drovo')) {
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

  // SQLite .db
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
      const tbls = src
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations'")
        .all() as { name: string }[];
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

  return { type: 'unknown', tables: [], warnings: ['Unsupported format. Use .csv, .zip, .json, or .db'], fileSizeBytes };
}

// ─── CSV import ──────────────────────────────────────────────────────────────

export async function importFromCSV(
  filePath: string,
  tableNameOverride: string | null,
  options: ImportOptions,
  mainWindow: BrowserWindow | null,
): Promise<CsvImportResult> {
  const send = (p: Partial<ImportProgress>) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('import:progress', p);
  };

  const baseName = path.basename(filePath, '.csv');
  const rawTable = tableNameOverride ?? baseName;
  const tableName = resolveTableName(rawTable);

  const dbCols = getLocalCols(tableName);
  if (dbCols.length === 0) {
    throw new Error(`Table "${tableName}" not found in local database`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Auto-detect delimiter: Supabase exports use semicolons by default
  const firstLine = content.slice(0, content.indexOf('\n') || 500);
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semicolons > commas ? ';' : ',';

  const records: Record<string, string>[] = parseCsv(content, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,          // strips \t and spaces Supabase adds to values
    relax_quotes: true,
    relax_column_count: true,
  });

  if (records.length === 0) {
    return { tableName, imported: 0, skipped: 0, errors: [], skippedCols: [] };
  }

  const csvCols = Object.keys(records[0]);
  const useCols = csvCols.filter((c) => dbCols.includes(c));
  const skippedCols = csvCols.filter((c) => !dbCols.includes(c));

  if (useCols.length === 0) {
    throw new Error(
      `No matching columns between CSV (${csvCols.slice(0, 5).join(', ')}${csvCols.length > 5 ? '...' : ''}) ` +
      `and SQLite table "${tableName}" (${dbCols.slice(0, 5).join(', ')}${dbCols.length > 5 ? '...' : ''}). ` +
      `Delimiter detected: "${delimiter}". ` +
      `Check that the CSV filename matches the table name.`,
    );
  }

  const db = getDb();
  const colList = useCols.map((c) => `"${c}"`).join(', ');
  const placeholders = useCols.map(() => '?').join(', ');
  const verb =
    options.mode === 'add-only' ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
  const stmt = db.prepare(`${verb} INTO "${tableName}" (${colList}) VALUES (${placeholders})`);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const BATCH = 100;

  const insertBatch = db.transaction((batch: Record<string, string>[]): [number, number] => {
    let batchImported = 0;
    let batchSkipped = 0;
    for (const row of batch) {
      try {
        const id = row['id'] || crypto.randomUUID();
        const values = useCols.map((c) => (c === 'id' ? id : fromCsvValue(row[c])));
        stmt.run(values);
        batchImported++;
      } catch (e: unknown) {
        errors.push(`id=${row['id'] ?? '?'}: ${String(e)}`);
        batchSkipped++;
      }
    }
    return [batchImported, batchSkipped];
  });

  for (let i = 0; i < records.length; i += BATCH) {
    if (cancelFlag) break;
    const [bi, bs] = insertBatch(records.slice(i, i + BATCH));
    imported += bi;
    skipped += bs;
    send({
      status: 'running',
      table: tableName,
      tablesTotal: 1,
      tablesDone: 0,
      rowsTotal: records.length,
      rowsDone: Math.min(i + BATCH, records.length),
      errors,
      skippedCols,
    });
    // Yield the event loop so webContents.send() flushes to the renderer
    // between batches — without this, the main process blocks and progress
    // events only arrive after the entire import completes.
    await new Promise<void>((r) => setImmediate(r));
  }

  return { tableName, imported, skipped, errors, skippedCols };
}

// ─── ZIP import ──────────────────────────────────────────────────────────────

export async function importFromZip(
  filePath: string,
  options: ImportOptions,
  mainWindow: BrowserWindow | null,
): Promise<ZipImportResult> {
  const send = (p: Partial<ImportProgress>) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('import:progress', p);
  };

  const zip = new AdmZip(filePath);
  const entries = zip
    .getEntries()
    .filter((e) => e.entryName.endsWith('.csv') && !e.isDirectory);

  const tmpDir = path.join(path.dirname(filePath), `_drovo_zip_tmp_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const tables: ZipImportResult['tables'] = [];
  const allErrors: string[] = [];

  try {
    for (let i = 0; i < entries.length; i++) {
      if (cancelFlag) break;
      const entry = entries[i];
      const safeName = entry.entryName.replace(/[/\\]/g, '_');
      const csvPath = path.join(tmpDir, safeName);
      fs.writeFileSync(csvPath, entry.getData());

      const displayName = path.basename(entry.entryName, '.csv');
      send({
        status: 'running',
        table: resolveTableName(displayName),
        tablesTotal: entries.length,
        tablesDone: i,
        rowsTotal: 0,
        rowsDone: 0,
        errors: allErrors,
      });

      try {
        const r = await importFromCSV(csvPath, null, options, mainWindow);
        tables.push({ tableName: r.tableName, imported: r.imported, skipped: r.skipped });
        allErrors.push(...r.errors.slice(0, 10)); // cap per-table errors
      } catch (e: unknown) {
        allErrors.push(`${entry.entryName}: ${String(e)}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { tables, errors: allErrors };
}

// ─── JSON import ─────────────────────────────────────────────────────────────

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
    const prog: ImportProgress = {
      status: 'error', tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0,
      errors: [String(e)], message: `فشل الاستيراد: ${String(e)}`,
    };
    send(prog);
    return prog;
  }
}

// ─── SQLite import ────────────────────────────────────────────────────────────

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
    const tbls = src
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations'")
      .all() as { name: string }[];
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
    const prog: ImportProgress = {
      status: 'error', tablesTotal: 0, tablesDone: 0, rowsTotal: 0, rowsDone: 0,
      errors: [String(e)], message: `فشل الاستيراد: ${String(e)}`,
    };
    send(prog);
    return prog;
  }
}

// ─── IPC setup ────────────────────────────────────────────────────────────────

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
    if (ext.endsWith('.db')) return importFromSQLite(filePath, options, mainWindow);
    return importFromJson(filePath, options, mainWindow);
  });

  ipcMain.handle('import:csv', async (_event, filePath: string, tableNameOverride: string | null, options: ImportOptions) => {
    try {
      cancelFlag = false;
      const result = await importFromCSV(filePath, tableNameOverride, options, mainWindow);
      const totalRows = result.imported + result.skipped;
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('import:progress', {
          status: 'done',
          table: result.tableName,
          tablesTotal: 1,
          tablesDone: 1,
          rowsTotal: totalRows,
          rowsDone: result.imported,
          errors: result.errors,
          skippedCols: result.skippedCols,
          message: result.skipped > 0
            ? `تم استيراد ${result.imported} من ${totalRows} سجل (${result.skipped} فشلت)`
            : `تم استيراد ${result.imported} سجل`,
        } as ImportProgress);
      }
      return { data: result, error: null };
    } catch (e: unknown) {
      return { data: null, error: String(e) };
    }
  });

  ipcMain.handle('import:zip', async (_event, filePath: string, options: ImportOptions) => {
    try {
      cancelFlag = false;
      const result = await importFromZip(filePath, options, mainWindow);
      const totalImported = result.tables.reduce((s, t) => s + t.imported, 0);
      const totalSkipped = result.tables.reduce((s, t) => s + t.skipped, 0);
      const totalRows = totalImported + totalSkipped;
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('import:progress', {
          status: 'done',
          tablesTotal: result.tables.length,
          tablesDone: result.tables.length,
          rowsTotal: totalRows,
          rowsDone: totalImported,
          errors: result.errors,
          message: `تم استيراد ${totalImported} سجل في ${result.tables.length} جدول`,
        } as ImportProgress);
      }
      return { data: result, error: null };
    } catch (e: unknown) {
      return { data: null, error: String(e) };
    }
  });

  ipcMain.handle('import:cancel', () => {
    cancelFlag = true;
    return { success: true };
  });
}
