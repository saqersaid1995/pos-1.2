import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const SQLITE_MAGIC = 'SQLite format 3\0';
const MAX_AUTO_BACKUPS = 10;

interface BackupConfig {
  enabled: boolean;
  folder: string;
  intervalHours: number;
  lastBackupAt?: string;
}

interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'data.db');
}

function getBackupConfigPath(): string {
  return path.join(app.getPath('userData'), 'backup-config.json');
}

function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function buildBackupFilename(date: Date = new Date()): string {
  return `drovo-backup-${formatTimestamp(date)}.db`;
}

function validateSQLiteFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return bytesRead >= 16 && buf.toString('binary') === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

function loadBackupConfig(): BackupConfig | null {
  try {
    const configPath = getBackupConfigPath();
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as BackupConfig;
  } catch {
    return null;
  }
}

function saveBackupConfig(config: BackupConfig): void {
  fs.writeFileSync(getBackupConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function listDbFiles(folder: string): BackupFileInfo[] {
  try {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder)
      .filter((name) => name.endsWith('.db'))
      .map((name) => {
        const filePath = path.join(folder, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, size: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  } catch {
    return [];
  }
}

function pruneOldBackups(folder: string): void {
  try {
    const files = listDbFiles(folder).reverse();
    while (files.length > MAX_AUTO_BACKUPS) {
      const oldest = files.shift();
      if (oldest) { try { fs.unlinkSync(oldest.path); } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
}

function runAutoBackupIfDue(config: BackupConfig): void {
  try {
    if (!config.enabled || !config.folder) return;
    const now = new Date();
    if (config.lastBackupAt) {
      const diffHours = (now.getTime() - new Date(config.lastBackupAt).getTime()) / 3_600_000;
      if (diffHours < config.intervalHours) return;
    }
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return;
    if (!fs.existsSync(config.folder)) fs.mkdirSync(config.folder, { recursive: true });
    fs.copyFileSync(dbPath, path.join(config.folder, buildBackupFilename(now)));
    config.lastBackupAt = now.toISOString();
    saveBackupConfig(config);
    pruneOldBackups(config.folder);
  } catch (err) {
    console.error('[Backup] Auto-backup failed:', err instanceof Error ? err.message : String(err));
  }
}

export function setupBackupIPC(_mainWindow: Electron.BrowserWindow): void {
  const startupConfig = loadBackupConfig();
  if (startupConfig) runAutoBackupIfDue(startupConfig);

  ipcMain.handle('backup:export', async (_event, targetPath: string) => {
    try {
      const dbPath = getDbPath();
      if (!fs.existsSync(dbPath)) return { success: false, error: 'Database file not found.' };
      if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
      const destPath = path.join(targetPath, buildBackupFilename());
      fs.copyFileSync(dbPath, destPath);
      return { success: true, path: destPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('backup:import', async (_event, sourcePath: string) => {
    try {
      if (!fs.existsSync(sourcePath)) return { success: false, error: 'Source file not found.' };
      if (!validateSQLiteFile(sourcePath)) return { success: false, error: 'Invalid SQLite database file.' };
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.bak-${Date.now()}`);
      fs.copyFileSync(sourcePath, dbPath);
      return { success: true, requiresRestart: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('backup:auto-config', async (_event, newConfig: BackupConfig) => {
    try {
      const existing = loadBackupConfig();
      saveBackupConfig({ ...(existing ?? {}), enabled: newConfig.enabled, folder: newConfig.folder, intervalHours: newConfig.intervalHours });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('backup:list', async (_event, folder: string) => {
    try {
      return { success: true, files: listDbFiles(folder) };
    } catch (err) {
      return { success: false, files: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('backup:restore', async (_event, backupPath: string) => {
    try {
      if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup file not found.' };
      if (!validateSQLiteFile(backupPath)) return { success: false, error: 'Invalid SQLite database file.' };
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.bak-${Date.now()}`);
      fs.copyFileSync(backupPath, dbPath);
      return { success: true, requiresRestart: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
