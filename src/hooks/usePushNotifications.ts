import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// This is a PUBLIC key - safe to embed in client code
const VAPID_PUBLIC_KEY = "BH2apNjm-M9hhvuv6z7EimqQIY_-yIwjsHQ_nhUa48y54rfzobiXz2QUdJalPPRCegKm9TEp-R2IiMcDYPenM8U";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check existing subscription on mount
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, [user]);

  const subscribe = useCallback(async () => {
    if (!user || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    setLoading(true);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON();
      const endpoint = subJson.endpoint!;
      const p256dh = subJson.keys!.p256dh!;
      const auth = subJson.keys!.auth!;

      // Save to DB
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          app_context: "support-lite",
        },
        { onConflict: "endpoint" }
      );

      if (error) {
        console.error("Failed to save push subscription:", error);
        setLoading(false);
        return false;
      }

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (e) {
      console.error("Push subscribe error:", e);
      setLoading(false);
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        // Remove from DB
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);
      }
      setIsSubscribed(false);
    } catch (e) {
      console.error("Unsubscribe error:", e);
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("Lavinderia Support", {
      body: "Test notification — push is working! ✅",
      icon: "/support-icon-192.png",
      badge: "/support-icon-192.png",
      tag: "test",
    });
  }, []);

  return {
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    sendTestNotification,
    isSupported: typeof Notification !== "undefined" && "PushManager" in (window || {}),
  };
}
