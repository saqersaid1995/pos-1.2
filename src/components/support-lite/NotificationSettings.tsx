import { Bell, BellOff, CheckCircle, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

export default function NotificationSettings() {
  const {
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    sendTestNotification,
    isSupported,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Push notifications are not supported on this device/browser.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border border-border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Push Notifications</span>
        </div>
        <Badge
          variant={isSubscribed ? "default" : "secondary"}
          className={cn("text-[10px]", isSubscribed && "bg-green-600")}
        >
          {isSubscribed ? "Active" : permission === "denied" ? "Blocked" : "Off"}
        </Badge>
      </div>

      {permission === "denied" && (
        <p className="text-xs text-destructive">
          Notifications are blocked. Please enable them in your browser/device settings.
        </p>
      )}

      <div className="flex gap-2">
        {!isSubscribed ? (
          <Button
            size="sm"
            onClick={subscribe}
            disabled={loading || permission === "denied"}
            className="flex-1 h-9 text-xs"
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {loading ? "Enabling..." : "Enable Notifications"}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={unsubscribe}
              className="flex-1 h-9 text-xs"
            >
              <BellOff className="h-3.5 w-3.5 mr-1.5" />
              Disable
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={sendTestNotification}
              className="h-9 text-xs"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Test
            </Button>
          </>
        )}
      </div>

      {isSubscribed && (
        <div className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle className="h-3 w-3" />
          <span>You'll receive alerts for new customer messages</span>
        </div>
      )}
    </div>
  );
}
