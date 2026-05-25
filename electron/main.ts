const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  session,
} = require('electron') as typeof import('electron');
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const crypto = require('crypto') as typeof import('crypto');

const { setupAutoUpdater } = require('./updater') as { setupAutoUpdater: (win: Electron.BrowserWindow) => void };
const { setupDatabaseIPC } = require('./db/index') as { setupDatabaseIPC: () => void };
const { setupBackupIPC } = require('./backup/manager') as { setupBackupIPC: (win: Electron.BrowserWindow) => void };

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

// ------------------------------------------------------------------
// Window state persistence
// ------------------------------------------------------------------
function getWindowStatePath(): string {
  const drovoDir = path.join(app.getPath('appData'), 'DROVO');
  if (!fs.existsSync(drovoDir)) {
    fs.mkdirSync(drovoDir, { recursive: true });
  }
  return path.join(drovoDir, 'window-state.json');
}

function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1400, height: 900 };
  try {
    const statePath = getWindowStatePath();
    if (!fs.existsSync(statePath)) return defaults;
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      width: parsed.width && parsed.width >= 1280 ? parsed.width : defaults.width,
      height: parsed.height && parsed.height >= 800 ? parsed.height : defaults.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
    };
  } catch {
    return defaults;
  }
}

function saveWindowState(win: Electron.BrowserWindow): void {
  try {
    if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    };
    const statePath = getWindowStatePath();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-fatal: ignore
  }
}

// ------------------------------------------------------------------
// Hardware ID
// ------------------------------------------------------------------
function getHardwareId(): string {
  const raw = `${os.cpus()[0]?.model ?? 'cpu'}::${os.hostname()}::${os.platform()}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ------------------------------------------------------------------
// Window creation
// ------------------------------------------------------------------
let mainWindow: Electron.BrowserWindow | null = null;

function createWindow(): void {
  const isDev = !app.isPackaged;
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: 1280,
    minHeight: 800,
    x: windowState.x,
    y: windowState.y,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Hide menu bar entirely in production
  if (!isDev) {
    mainWindow.setMenuBarVisibility(false);
  }

  // Gracefully show window once ready
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
  });

  // Persist window state on resize/move/close
  mainWindow.on('resize', () => saveWindowState(mainWindow!));
  mainWindow.on('move', () => saveWindowState(mainWindow!));
  mainWindow.on('close', () => saveWindowState(mainWindow!));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load content
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // Set up auto-updater
  setupAutoUpdater(mainWindow);

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived(
    (details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => {
      const csp = isDev
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; img-src 'self' data: blob:; font-src 'self' data:;"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';";

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    }
  );
}

// ------------------------------------------------------------------
// IPC Handlers
// ------------------------------------------------------------------
function setupCoreIPC(): void {
  // App version
  ipcMain.handle('app:version', (): string => app.getVersion());

  // Hardware ID
  ipcMain.handle('hardware:id', (): string => getHardwareId());

  // Printer list
  ipcMain.handle('printer:list', (): Electron.PrinterInfo[] => {
    try {
      const wc = mainWindow?.webContents;
      if (!wc || wc.isDestroyed()) return [];
      if (typeof wc.getPrinters === 'function') {
        return wc.getPrinters();
      }
      return [];
    } catch {
      return [];
    }
  });

  // Print
  ipcMain.handle(
    'printer:print',
    (_event: Electron.IpcMainInvokeEvent, options: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        try {
          const wc = mainWindow?.webContents;
          if (!wc || wc.isDestroyed()) {
            return resolve({ success: false, error: 'No active window.' });
          }
          wc.print(options as Electron.WebContentsPrintOptions, (success: boolean, failureReason?: string) => {
            if (success) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: failureReason ?? 'Print failed.' });
            }
          });
        } catch (err) {
          resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    }
  );

  // Dialog: open folder
  ipcMain.handle('dialog:open-folder', async (): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // Dialog: open file
  ipcMain.handle(
    'dialog:open-file',
    async (_event: Electron.IpcMainInvokeEvent, filters?: Electron.FileFilter[]): Promise<string | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters ?? [],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }
  );

  // Dialog: save file
  ipcMain.handle(
    'dialog:save-file',
    async (
      _event: Electron.IpcMainInvokeEvent,
      defaultPath?: string,
      filters?: Electron.FileFilter[]
    ): Promise<string | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: filters ?? [],
      });
      return result.canceled ? null : (result.filePath ?? null);
    }
  );
}

// ------------------------------------------------------------------
// Single instance lock
// ------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ------------------------------------------------------------------
  // App lifecycle
  // ------------------------------------------------------------------
  app.whenReady().then(() => {
    setupCoreIPC();
    setupDatabaseIPC();
    createWindow();

    if (mainWindow) {
      setupBackupIPC(mainWindow);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
