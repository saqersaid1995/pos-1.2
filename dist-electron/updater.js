"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAutoUpdater = setupAutoUpdater;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
function setupAutoUpdater(mainWindow) {
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:update-available', {
                version: info.version,
                releaseDate: info.releaseDate,
                releaseNotes: info.releaseNotes ?? null,
            });
        }
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:download-progress', {
                percent: Math.round(progress.percent),
                bytesPerSecond: progress.bytesPerSecond,
                transferred: progress.transferred,
                total: progress.total,
            });
        }
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:update-downloaded', { version: info.version });
        }
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Error:', err?.message ?? String(err));
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:error', {
                message: err?.message ?? 'Unknown updater error',
            });
        }
    });
    electron_1.ipcMain.handle('updater:start-download', async () => {
        try {
            await electron_updater_1.autoUpdater.downloadUpdate();
            return { success: true };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[AutoUpdater] Download failed:', message);
            return { success: false, error: message };
        }
    });
    electron_1.ipcMain.handle('updater:install-now', () => {
        try {
            electron_updater_1.autoUpdater.quitAndInstall(false, true);
        }
        catch (err) {
            console.error('[AutoUpdater] Install failed:', err instanceof Error ? err.message : String(err));
        }
    });
    electron_1.ipcMain.handle('app:check-updates', async () => {
        try {
            const result = await electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
            return { success: true, result };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[AutoUpdater] Check failed:', message);
            return { success: false, error: message };
        }
    });
}
