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

// Log once at startup so the Electron console shows the detection result.
if (typeof window !== 'undefined') {
  console.log(
    '[electron.ts] isElectron:', isElectron,
    '| window.drovo:', typeof (window as any).drovo,
    '| navigator.onLine:', navigator.onLine,
    '| canUseServer():', navigator.onLine || isElectron,
  );
}
