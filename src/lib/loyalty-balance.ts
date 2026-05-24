import { supabase } from "@/integrations/supabase/client";

/**
 * Loyalty balance breakdown for a customer.
 * Computed from loyalty_transactions (the source of truth for expiry-aware logic).
 *
 * - available: sum of remaining_points on non-expired earn rows
 * - expired:   sum of remaining_points on expired earn rows (informational)
 * - expiringSoon: subset of available that expires within the warning window
 * - lastEarnedAt: most recent earn timestamp
 * - nextExpiryAt: nearest future expiry date among non-empty earn rows
 */
export interface LoyaltyBalance {
  available: number;
  expired: number;
  expiringSoon: number;
  expiringSoonDays: number;
  lastEarnedAt: string | null;
  nextExpiryAt: string | null;
}

export const EXPIRING_SOON_DAYS = 7;

export async function fetchLoyaltyBalance(
  customerId: string,
  warnDays = EXPIRING_SOON_DAYS
): Promise<LoyaltyBalance> {
  const { data } = await supabase
    .from("loyalty_transactions")
    .select("points, remaining_points, expires_at, created_at, type")
    .eq("customer_id", customerId)
    .eq("type", "earn");

  const now = Date.now();
  const warnUntil = now + warnDays * 24 * 60 * 60 * 1000;

  let available = 0;
  let expired = 0;
  let expiringSoon = 0;
  let lastEarnedAt: string | null = null;
  let nextExpiryAt: string | null = null;

  for (const r of (data || []) as any[]) {
    const remaining = Number(r.remaining_points) || 0;
    const createdAt: string | null = r.created_at;
    const expiresAt: string | null = r.expires_at;
    if (createdAt && (!lastEarnedAt || createdAt > lastEarnedAt)) lastEarnedAt = createdAt;

    if (remaining <= 0) continue;
    const expMs = expiresAt ? new Date(expiresAt).getTime() : Infinity;

    if (expMs <= now) {
      expired += remaining;
    } else {
      available += remaining;
      if (expiresAt && (!nextExpiryAt || expiresAt < nextExpiryAt)) nextExpiryAt = expiresAt;
      if (expMs <= warnUntil) expiringSoon += remaining;
    }
  }

  return {
    available: Number(available.toFixed(2)),
    expired: Number(expired.toFixed(2)),
    expiringSoon: Number(expiringSoon.toFixed(2)),
    expiringSoonDays: warnDays,
    lastEarnedAt,
    nextExpiryAt,
  };
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = (new Date(iso).getTime() - Date.now()) / 86400000;
  return Math.max(0, Math.ceil(d));
}
