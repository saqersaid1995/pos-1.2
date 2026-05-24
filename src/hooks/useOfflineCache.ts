import { useEffect, useRef } from "react";
import { refreshOfflineCache } from "@/lib/offline-cache";

/**
 * Refreshes the offline cache when the app is online.
 * Runs once on mount and whenever the browser comes back online.
 */
export function useOfflineCache() {
  const hasRun = useRef(false);

  useEffect(() => {
    const doCache = async () => {
      if (!navigator.onLine) return;
      try {
        await refreshOfflineCache();
      } catch (err) {
        console.error("Offline cache refresh failed:", err);
      }
    };

    if (!hasRun.current) {
      hasRun.current = true;
      doCache();
    }

    window.addEventListener("online", doCache);
    return () => window.removeEventListener("online", doCache);
  }, []);
}
