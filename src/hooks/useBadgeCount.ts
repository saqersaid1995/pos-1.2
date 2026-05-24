import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useBadgeCount() {
  const updateBadge = useCallback(async () => {
    if (!("setAppBadge" in navigator)) return;

    const { data } = await supabase
      .from("whatsapp_messages")
      .select("phone")
      .eq("type", "incoming")
      .eq("is_read", false)
      .eq("is_deleted", false);

    const unreadConversations = new Set(data?.map((m) => m.phone) || []).size;

    if (unreadConversations > 0) {
      (navigator as any).setAppBadge(unreadConversations);
    } else {
      (navigator as any).clearAppBadge();
    }
  }, []);

  useEffect(() => {
    updateBadge();

    const channel = supabase
      .channel("badge-count-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => updateBadge()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [updateBadge]);

  return { updateBadge };
}
