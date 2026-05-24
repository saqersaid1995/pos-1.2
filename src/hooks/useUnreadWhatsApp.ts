import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadWhatsApp() {
  const [count, setCount] = useState(0);

  const fetchCount = async () => {
    const { count: c } = await supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true })
      .eq("type", "incoming")
      .eq("is_read", false)
      .eq("is_deleted", false);
    setCount(c ?? 0);
  };

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel("unread-whatsapp-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
