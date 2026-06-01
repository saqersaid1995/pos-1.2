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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const updater_1 = require("./updater");
const index_1 = require("./db/index");
const manager_1 = require("./backup/manager");
// ------------------------------------------------------------------
// Window state persistence
// ------------------------------------------------------------------
function getWindowStatePath() {
    const drovoDir = path.join(electron_1.app.getPath('appData'), 'DROVO');
    if (!fs.existsSync(drovoDir)) {
        fs.mkdirSync(drovoDir, { recursive: true });
    }
    return path.join(drovoDir, 'window-state.json');
}
function loadWindowState() {
    const defaults = { width: 1400, height: 900 };
    try {
        const statePath = getWindowStatePath();
        if (!fs.existsSync(statePath))
            return defaults;
        const raw = fs.readFileSync(statePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            width: parsed.width && parsed.width >= 1280 ? parsed.width : defaults.width,
            height: parsed.height && parsed.height >= 800 ? parsed.height : defaults.height,
            x: typeof parsed.x === 'number' ? parsed.x : undefined,
            y: typeof parsed.y === 'number' ? parsed.y : undefined,
        };
    }
    catch {
        return defaults;
    }
}
function saveWindowState(win) {
    try {
        if (win.isMaximized() || win.isMinimized() || win.isFullScreen())
            return;
        const bounds = win.getBounds();
        const state = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
        };
        fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
    }
    catch {
        // Non-fatal
    }
}
// ------------------------------------------------------------------
// Hardware ID
// ------------------------------------------------------------------
function getHardwareId() {
    const raw = `${os.cpus()[0]?.model ?? 'cpu'}::${os.hostname()}::${os.platform()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}
// ------------------------------------------------------------------
// Window creation
// ------------------------------------------------------------------
let mainWindow = null;
function createWindow() {
    const isDev = !electron_1.app.isPackaged;
    const windowState = loadWindowState();
    mainWindow = new electron_1.BrowserWindow({
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
        mainWindow.show();
    });
    mainWindow.on('resize', () => saveWindowState(mainWindow));
    mainWindow.on('move', () => saveWindowState(mainWindow));
    mainWindow.on('close', () => saveWindowState(mainWindow));
    mainWindow.on('closed', () => { mainWindow = null; });
    if (isDev) {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(electron_1.app.getAppPath(), 'dist', 'index.html'));
    }
    (0, updater_1.setupAutoUpdater)(mainWindow);
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const csp = isDev
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; img-src 'self' data: blob:; font-src 'self' data:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';";
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
            },
        });
    });
}
// ------------------------------------------------------------------
// IPC Handlers
// ------------------------------------------------------------------
function setupCoreIPC() {
    electron_1.ipcMain.handle('app:version', () => electron_1.app.getVersion());
    electron_1.ipcMain.handle('hardware:id', () => getHardwareId());
    electron_1.ipcMain.handle('printer:list', async () => {
        try {
            const wc = mainWindow?.webContents;
            if (!wc || wc.isDestroyed())
                return [];
            return await wc.getPrintersAsync();
        }
        catch {
            return [];
        }
    });
    electron_1.ipcMain.handle('printer:print', (_event, options) => {
        return new Promise((resolve) => {
            try {
                const wc = mainWindow?.webContents;
                if (!wc || wc.isDestroyed())
                    return resolve({ success: false, error: 'No active window.' });
                wc.print(options, (success, failureReason) => {
                    resolve(success ? { success: true } : { success: false, error: failureReason ?? 'Print failed.' });
                });
            }
            catch (err) {
                resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
            }
        });
    });
    electron_1.ipcMain.handle('dialog:open-folder', async () => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    electron_1.ipcMain.handle('dialog:open-file', async (_event, filters) => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: filters ?? [],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    electron_1.ipcMain.handle('dialog:save-file', async (_event, defaultPath, filters) => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
            defaultPath,
            filters: filters ?? [],
        });
        return result.canceled ? null : (result.filePath ?? null);
    });
}
// ------------------------------------------------------------------
// Single instance lock & app lifecycle
// ------------------------------------------------------------------
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(() => {
        setupCoreIPC();
        (0, index_1.setupDatabaseIPC)();
        createWindow();
        if (mainWindow) {
            (0, manager_1.setupBackupIPC)(mainWindow);
        }
    });
    electron_1.app.on('window-all-closed', () => {
        if (process.platform !== 'darwin')
            electron_1.app.quit();
    });
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
}
