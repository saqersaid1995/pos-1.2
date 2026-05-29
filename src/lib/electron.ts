// Returns true when running inside the Electron desktop app.
// In Electron the preload script exposes window.drovo via contextBridge.
export const isElectron =
  typeof window !== 'undefined' && typeof (window as any).drovo !== 'undefined';

// In Electron, SQLite is always available (localDb routes all supabase calls
// to SQLite via IPC). Use this instead of navigator.onLine for deciding
// whether to read from the server (SQLite/Supabase) vs local IndexedDB cache.
export function canUseServer(): boolean {
  return navigator.onLine || isElectron;
}
