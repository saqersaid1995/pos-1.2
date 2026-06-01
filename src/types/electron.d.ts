interface DrovoDb {
  query: (sql: string, params?: unknown[]) => Promise<{ data: unknown[]; error: unknown }>;
  run: (sql: string, params?: unknown[]) => Promise<{ data: { changes: number; lastInsertRowid: number | bigint }; error: unknown }>;
  transaction: (ops: Array<{ sql: string; params?: unknown[] }>) => Promise<{ data: unknown[]; error: unknown }>;
}

interface DrovoApp {
  version: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
  platform: () => string;
}

interface DrovoBackup {
  export: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  import: (sourcePath: string) => Promise<{ success: boolean; requiresRestart?: boolean; error?: string }>;
  autoBackup: (config: { enabled: boolean; folder: string; intervalHours: number }) => Promise<{ success: boolean }>;
  listBackups: (folder: string) => Promise<Array<{ name: string; path: string; size: number; createdAt: string }>>;
  restoreBackup: (backupPath: string) => Promise<{ success: boolean; requiresRestart?: boolean; error?: string }>;
}

interface DrovoPrinter {
  list: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  print: (options: Record<string, unknown>) => Promise<void>;
}

interface DrovoHardware {
  id: () => Promise<string>;
}

interface DrovoDialog {
  openFolder: () => Promise<string | null>;
  openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  saveFile: (defaultPath?: string, filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
}

interface Window {
  drovo: {
    db: DrovoDb;
    app: DrovoApp;
    backup: DrovoBackup;
    printer: DrovoPrinter;
    hardware: DrovoHardware;
    dialog: DrovoDialog;
  };
}
