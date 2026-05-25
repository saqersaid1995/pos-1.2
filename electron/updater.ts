const { ipcMain } = require('electron') as typeof import('electron');
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface UpdateDownloadedInfo {
  version: string;
}

function setupAutoUpdater(mainWindow: Electron.BrowserWindow): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes ?? null,
      });
    }
  });

  autoUpdater.on('download-progress', (progress: DownloadProgress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedInfo) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[AutoUpdater] Error:', err?.message ?? String(err));
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:error', {
        message: err?.message ?? 'Unknown updater error',
      });
    }
  });

  ipcMain.handle('updater:start-download', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AutoUpdater] Download failed:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('updater:install-now', (): void => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.error('[AutoUpdater] Install failed:', err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('app:check-updates', async (): Promise<{ success: boolean; result?: unknown; error?: string }> => {
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify();
      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AutoUpdater] Check for updates failed:', message);
      return { success: false, error: message };
    }
  });
}

module.exports = { setupAutoUpdater };
