import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  session,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

import { setupAutoUpdater } from './updater';
import { setupDatabaseIPC } from './db/index';
import { setupBackupIPC } from './backup/manager';
import { setupImportIPC } from './import/manager';

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

function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-fatal
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
let mainWindow: BrowserWindow | null = null;

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

  if (!isDev) {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
  });

  mainWindow.on('resize', () => saveWindowState(mainWindow!));
  mainWindow.on('move', () => saveWindowState(mainWindow!));
  mainWindow.on('close', () => saveWindowState(mainWindow!));
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  setupAutoUpdater(mainWindow);

  session.defaultSession.webRequest.onHeadersReceived(
    (details, callback) => {
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
  ipcMain.handle('app:version', (): string => app.getVersion());

  ipcMain.handle('hardware:id', (): string => getHardwareId());

  ipcMain.handle('printer:list', async (): Promise<Electron.PrinterInfo[]> => {
    try {
      const wc = mainWindow?.webContents;
      if (!wc || wc.isDestroyed()) return [];
      return await wc.getPrintersAsync();
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    'printer:print',
    (_event, options: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        try {
          const wc = mainWindow?.webContents;
          if (!wc || wc.isDestroyed()) return resolve({ success: false, error: 'No active window.' });
          wc.print(options as Electron.WebContentsPrintOptions, (success, failureReason) => {
            resolve(success ? { success: true } : { success: false, error: failureReason ?? 'Print failed.' });
          });
        } catch (err) {
          resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    }
  );

  ipcMain.handle('dialog:open-folder', async (): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('dialog:open-file', async (_event, filters?: Electron.FileFilter[]): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters ?? [],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
    'dialog:save-file',
    async (_event, defaultPath?: string, filters?: Electron.FileFilter[]): Promise<string | null> => {
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
// Single instance lock & app lifecycle
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

  app.whenReady().then(() => {
    setupCoreIPC();
    setupDatabaseIPC();
    createWindow();
    if (mainWindow) {
      setupBackupIPC(mainWindow);
      setupImportIPC(mainWindow);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
