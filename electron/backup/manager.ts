const { ipcMain, app } = require('electron') as typeof import('electron');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

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
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}-` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
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
    if (bytesRead < 16) return false;
    return buf.toString('binary') === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

function loadBackupConfig(): BackupConfig | null {
  try {
    const configPath = getBackupConfigPath();
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as BackupConfig;
  } catch {
    return null;
  }
}

function saveBackupConfig(config: BackupConfig): void {
  const configPath = getBackupConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function listDbFiles(folder: string): BackupFileInfo[] {
  try {
    if (!fs.existsSync(folder)) return [];
    const entries = fs.readdirSync(folder) as string[];
    return entries
      .filter((name: string) => name.endsWith('.db'))
      .map((name: string) => {
        const filePath = path.join(folder, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          path: filePath,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        } as BackupFileInfo;
      })
      .sort(
        (a: BackupFileInfo, b: BackupFileInfo) =>
          new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      );
  } catch {
    return [];
  }
}

function pruneOldBackups(folder: string): void {
  try {
    if (!fs.existsSync(folder)) return;
    // listDbFiles returns newest-first; reverse to get oldest-first for pruning
    const files: BackupFileInfo[] = listDbFiles(folder).reverse();
    while (files.length > MAX_AUTO_BACKUPS) {
      const oldest = files.shift();
      if (oldest) {
        try {
          fs.unlinkSync(oldest.path);
        } catch {
          // Ignore deletion errors
        }
      }
    }
  } catch {
    // Ignore pruning errors
  }
}

function runAutoBackupIfDue(config: BackupConfig): void {
  try {
    if (!config.enabled || !config.folder) return;

    const now = new Date();
    if (config.lastBackupAt) {
      const last = new Date(config.lastBackupAt);
      const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
      if (diffHours < config.intervalHours) return;
    }

    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return;

    if (!fs.existsSync(config.folder)) {
      fs.mkdirSync(config.folder, { recursive: true });
    }

    const destFilename = buildBackupFilename(now);
    const destPath = path.join(config.folder, destFilename);
    fs.copyFileSync(dbPath, destPath);

    config.lastBackupAt = now.toISOString();
    saveBackupConfig(config);

    pruneOldBackups(config.folder);
  } catch (err) {
    console.error('[Backup] Auto-backup failed:', err instanceof Error ? err.message : String(err));
  }
}

function setupBackupIPC(_mainWindow: Electron.BrowserWindow): void {
  // Run auto-backup on startup if config exists and backup is due
  const startupConfig = loadBackupConfig();
  if (startupConfig) {
    runAutoBackupIfDue(startupConfig);
  }

  ipcMain.handle(
    'backup:export',
    async (_event: Electron.IpcMainInvokeEvent, targetPath: string): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const dbPath = getDbPath();
        if (!fs.existsSync(dbPath)) {
          return { success: false, error: 'Database file not found.' };
        }
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
        const destFilename = buildBackupFilename();
        const destPath = path.join(targetPath, destFilename);
        fs.copyFileSync(dbPath, destPath);
        return { success: true, path: destPath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Backup] Export failed:', message);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'backup:import',
    async (_event: Electron.IpcMainInvokeEvent, sourcePath: string): Promise<{ success: boolean; requiresRestart?: boolean; error?: string }> => {
      try {
        if (!fs.existsSync(sourcePath)) {
          return { success: false, error: 'Source backup file not found.' };
        }
        if (!validateSQLiteFile(sourcePath)) {
          return { success: false, error: 'Invalid SQLite database file.' };
        }
        const dbPath = getDbPath();
        // Create a safety copy before replacing
        if (fs.existsSync(dbPath)) {
          const safetyPath = `${dbPath}.bak-${Date.now()}`;
          fs.copyFileSync(dbPath, safetyPath);
        }
        fs.copyFileSync(sourcePath, dbPath);
        return { success: true, requiresRestart: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Backup] Import failed:', message);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'backup:auto-config',
    async (_event: Electron.IpcMainInvokeEvent, newConfig: BackupConfig): Promise<{ success: boolean; error?: string }> => {
      try {
        const existing = loadBackupConfig();
        const merged: BackupConfig = {
          ...(existing ?? {}),
          enabled: newConfig.enabled,
          folder: newConfig.folder,
          intervalHours: newConfig.intervalHours,
        };
        saveBackupConfig(merged);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Backup] Save config failed:', message);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'backup:list',
    async (_event: Electron.IpcMainInvokeEvent, folder: string): Promise<{ success: boolean; files: BackupFileInfo[]; error?: string }> => {
      try {
        const files = listDbFiles(folder);
        return { success: true, files };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Backup] List failed:', message);
        return { success: false, error: message, files: [] };
      }
    }
  );

  ipcMain.handle(
    'backup:restore',
    async (_event: Electron.IpcMainInvokeEvent, backupPath: string): Promise<{ success: boolean; requiresRestart?: boolean; error?: string }> => {
      try {
        if (!fs.existsSync(backupPath)) {
          return { success: false, error: 'Backup file not found.' };
        }
        if (!validateSQLiteFile(backupPath)) {
          return { success: false, error: 'Invalid SQLite database file.' };
        }
        const dbPath = getDbPath();
        if (fs.existsSync(dbPath)) {
          const safetyPath = `${dbPath}.bak-${Date.now()}`;
          fs.copyFileSync(dbPath, safetyPath);
        }
        fs.copyFileSync(backupPath, dbPath);
        return { success: true, requiresRestart: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Backup] Restore failed:', message);
        return { success: false, error: message };
      }
    }
  );
}

module.exports = { setupBackupIPC };
