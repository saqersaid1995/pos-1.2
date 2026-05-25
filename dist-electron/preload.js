"use strict";
const { contextBridge, ipcRenderer } = require('electron');
function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
}
contextBridge.exposeInMainWorld('drovo', {
    db: {
        query: (sql, params) => invoke('db:query', sql, params),
        run: (sql, params) => invoke('db:run', sql, params),
        transaction: (ops) => invoke('db:transaction', ops),
    },
    app: {
        version: () => invoke('app:version'),
        checkForUpdates: () => invoke('app:check-updates'),
        platform: () => process.platform,
    },
    backup: {
        export: (targetPath) => invoke('backup:export', targetPath),
        import: (sourcePath) => invoke('backup:import', sourcePath),
        autoBackup: (config) => invoke('backup:auto-config', config),
        listBackups: (folder) => invoke('backup:list', folder),
        restoreBackup: (backupPath) => invoke('backup:restore', backupPath),
    },
    printer: {
        list: () => invoke('printer:list'),
        print: (options) => invoke('printer:print', options),
    },
    hardware: {
        id: () => invoke('hardware:id'),
    },
    dialog: {
        openFolder: () => invoke('dialog:open-folder'),
        openFile: (filters) => invoke('dialog:open-file', filters),
        saveFile: (defaultPath, filters) => invoke('dialog:save-file', defaultPath, filters),
    },
});
