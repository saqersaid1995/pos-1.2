import { useNetwork } from "@/contexts/NetworkContext";
import { WifiOff, Wifi, RefreshCw, Cloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function OfflineStatusBar() {
  const { isOnline, pendingCount, lastSyncTime, isSyncing, syncNow } = useNetwork();

  // Don't show anything if online and no pending changes
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`print:hidden px-4 py-2 flex items-center justify-between gap-3 text-xs border-b ${
        isOnline
          ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
      }`}
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">
          {isOnline ? "Online" : "Offline mode active"}
        </span>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {pendingCount} pending
          </Badge>
        )}
        {lastSyncTime && (
          <span className="text-muted-foreground hidden sm:inline">
            Last sync: {formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true })}
          </span>
        )}
      </div>

      {isOnline && pendingCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs gap-1.5 px-2"
          onClick={syncNow}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Cloud className="w-3 h-3" />
          )}
          {isSyncing ? "Syncing..." : "Sync Now"}
        </Button>
      )}

      {!isOnline && (
        <span className="text-[10px] opacity-70">
          Changes saved locally • WhatsApp disabled
        </span>
      )}
    </div>
  );
}
