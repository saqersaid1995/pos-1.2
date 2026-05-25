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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBackupIPC = setupBackupIPC;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SQLITE_MAGIC = 'SQLite format 3\0';
const MAX_AUTO_BACKUPS = 10;
function getDbPath() {
    return path.join(electron_1.app.getPath('userData'), 'data.db');
}
function getBackupConfigPath() {
    return path.join(electron_1.app.getPath('userData'), 'backup-config.json');
}
function formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
        `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`);
}
function buildBackupFilename(date = new Date()) {
    return `drovo-backup-${formatTimestamp(date)}.db`;
}
function validateSQLiteFile(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(16);
        const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
        fs.closeSync(fd);
        return bytesRead >= 16 && buf.toString('binary') === SQLITE_MAGIC;
    }
    catch {
        return false;
    }
}
function loadBackupConfig() {
    try {
        const configPath = getBackupConfigPath();
        if (!fs.existsSync(configPath))
            return null;
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function saveBackupConfig(config) {
    fs.writeFileSync(getBackupConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
function listDbFiles(folder) {
    try {
        if (!fs.existsSync(folder))
            return [];
        return fs.readdirSync(folder)
            .filter((name) => name.endsWith('.db'))
            .map((name) => {
            const filePath = path.join(folder, name);
            const stat = fs.statSync(filePath);
            return { name, path: filePath, size: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
        })
            .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    }
    catch {
        return [];
    }
}
function pruneOldBackups(folder) {
    try {
        const files = listDbFiles(folder).reverse();
        while (files.length > MAX_AUTO_BACKUPS) {
            const oldest = files.shift();
            if (oldest) {
                try {
                    fs.unlinkSync(oldest.path);
                }
                catch { /* ignore */ }
            }
        }
    }
    catch { /* ignore */ }
}
function runAutoBackupIfDue(config) {
    try {
        if (!config.enabled || !config.folder)
            return;
        const now = new Date();
        if (config.lastBackupAt) {
            const diffHours = (now.getTime() - new Date(config.lastBackupAt).getTime()) / 3600000;
            if (diffHours < config.intervalHours)
                return;
        }
        const dbPath = getDbPath();
        if (!fs.existsSync(dbPath))
            return;
        if (!fs.existsSync(config.folder))
            fs.mkdirSync(config.folder, { recursive: true });
        fs.copyFileSync(dbPath, path.join(config.folder, buildBackupFilename(now)));
        config.lastBackupAt = now.toISOString();
        saveBackupConfig(config);
        pruneOldBackups(config.folder);
    }
    catch (err) {
        console.error('[Backup] Auto-backup failed:', err instanceof Error ? err.message : String(err));
    }
}
function setupBackupIPC(_mainWindow) {
    const startupConfig = loadBackupConfig();
    if (startupConfig)
        runAutoBackupIfDue(startupConfig);
    electron_1.ipcMain.handle('backup:export', async (_event, targetPath) => {
        try {
            const dbPath = getDbPath();
            if (!fs.existsSync(dbPath))
                return { success: false, error: 'Database file not found.' };
            if (!fs.existsSync(targetPath))
                fs.mkdirSync(targetPath, { recursive: true });
            const destPath = path.join(targetPath, buildBackupFilename());
            fs.copyFileSync(dbPath, destPath);
            return { success: true, path: destPath };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    electron_1.ipcMain.handle('backup:import', async (_event, sourcePath) => {
        try {
            if (!fs.existsSync(sourcePath))
                return { success: false, error: 'Source file not found.' };
            if (!validateSQLiteFile(sourcePath))
                return { success: false, error: 'Invalid SQLite database file.' };
            const dbPath = getDbPath();
            if (fs.existsSync(dbPath))
                fs.copyFileSync(dbPath, `${dbPath}.bak-${Date.now()}`);
            fs.copyFileSync(sourcePath, dbPath);
            return { success: true, requiresRestart: true };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    electron_1.ipcMain.handle('backup:auto-config', async (_event, newConfig) => {
        try {
            const existing = loadBackupConfig();
            saveBackupConfig({ ...(existing ?? {}), enabled: newConfig.enabled, folder: newConfig.folder, intervalHours: newConfig.intervalHours });
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    electron_1.ipcMain.handle('backup:list', async (_event, folder) => {
        try {
            return { success: true, files: listDbFiles(folder) };
        }
        catch (err) {
            return { success: false, files: [], error: err instanceof Error ? err.message : String(err) };
        }
    });
    electron_1.ipcMain.handle('backup:restore', async (_event, backupPath) => {
        try {
            if (!fs.existsSync(backupPath))
                return { success: false, error: 'Backup file not found.' };
            if (!validateSQLiteFile(backupPath))
                return { success: false, error: 'Invalid SQLite database file.' };
            const dbPath = getDbPath();
            if (fs.existsSync(dbPath))
                fs.copyFileSync(dbPath, `${dbPath}.bak-${Date.now()}`);
            fs.copyFileSync(backupPath, dbPath);
            return { success: true, requiresRestart: true };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}
