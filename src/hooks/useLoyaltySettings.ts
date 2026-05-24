import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LoyaltySettings {
  id: string;
  is_enabled: boolean;
  earn_points_rate: number;
  redeem_points_rate: number;
  max_redemption_percent: number;
  min_redeem_points: number;
  loyalty_start_date: string | null;
  points_validity_days: number | null;
}

export function useLoyaltySettings() {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("loyalty_settings")
      .select("*")
      .limit(1)
      .single();
    if (data) setSettings(data as unknown as LoyaltySettings);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (updates: Partial<Omit<LoyaltySettings, "id">>) => {
    if (!settings) return;
    const { error } = await supabase
      .from("loyalty_settings")
      .update(updates as any)
      .eq("id", settings.id);
    if (!error) {
      setSettings({ ...settings, ...updates } as LoyaltySettings);
    }
    return { error };
  };

  return { settings, loading, update, refetch: fetch };
}
