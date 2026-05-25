const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('drovo', {
  db: {
    query: (sql: string, params?: unknown[]): Promise<unknown> =>
      invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]): Promise<unknown> =>
      invoke('db:run', sql, params),
    transaction: (ops: Array<{ sql: string; params?: unknown[] }>): Promise<unknown> =>
      invoke('db:transaction', ops),
  },

  app: {
    version: (): Promise<unknown> =>
      invoke('app:version'),
    checkForUpdates: (): Promise<unknown> =>
      invoke('app:check-updates'),
    platform: (): NodeJS.Platform =>
      process.platform,
  },

  backup: {
    export: (targetPath: string): Promise<unknown> =>
      invoke('backup:export', targetPath),
    import: (sourcePath: string): Promise<unknown> =>
      invoke('backup:import', sourcePath),
    autoBackup: (config: { enabled: boolean; folder: string; intervalHours: number }): Promise<unknown> =>
      invoke('backup:auto-config', config),
    listBackups: (folder: string): Promise<unknown> =>
      invoke('backup:list', folder),
    restoreBackup: (backupPath: string): Promise<unknown> =>
      invoke('backup:restore', backupPath),
  },

  printer: {
    list: (): Promise<unknown> =>
      invoke('printer:list'),
    print: (options: Record<string, unknown>): Promise<unknown> =>
      invoke('printer:print', options),
  },

  hardware: {
    id: (): Promise<unknown> =>
      invoke('hardware:id'),
  },

  dialog: {
    openFolder: (): Promise<unknown> =>
      invoke('dialog:open-folder'),
    openFile: (filters?: { name: string; extensions: string[] }[]): Promise<unknown> =>
      invoke('dialog:open-file', filters),
    saveFile: (defaultPath?: string, filters?: { name: string; extensions: string[] }[]): Promise<unknown> =>
      invoke('dialog:save-file', defaultPath, filters),
  },
});
