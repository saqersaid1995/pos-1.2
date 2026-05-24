import { supabase } from "@/integrations/supabase/client";

interface LoyaltySettingsRow {
  is_enabled: boolean;
  earn_points_rate: number;
  loyalty_start_date: string | null;
  points_validity_days: number | null;
}

async function getSettings(): Promise<LoyaltySettingsRow | null> {
  const { data } = await supabase
    .from("loyalty_settings")
    .select("is_enabled, earn_points_rate, loyalty_start_date, points_validity_days")
    .limit(1)
    .single();
  return (data as any) ?? null;
}

/**
 * Award loyalty points to a customer based on paid amount.
 * Respects loyalty_start_date (no points before that date) and points_validity_days (sets expires_at).
 */
export async function awardLoyaltyPoints(
  customerId: string,
  orderId: string,
  paidAmount: number,
  paymentDate: Date = new Date()
) {
  const settings = await getSettings();
  if (!settings?.is_enabled) return;

  // Start-date gate
  if (settings.loyalty_start_date) {
    const startMs = new Date(settings.loyalty_start_date + "T00:00:00").getTime();
    if (paymentDate.getTime() < startMs) return;
  }

  const earnRate = settings.earn_points_rate ?? 1;
  const pointsToEarn = parseFloat((paidAmount * earnRate).toFixed(2));
  if (pointsToEarn <= 0) return;

  const expiresAt =
    settings.points_validity_days && settings.points_validity_days > 0
      ? new Date(paymentDate.getTime() + settings.points_validity_days * 86400000).toISOString()
      : null;

  // Update cache (customer_loyalty)
  const { data: existing } = await supabase
    .from("customer_loyalty")
    .select("id, points_balance, total_earned")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("customer_loyalty")
      .update({
        points_balance: Number((existing as any).points_balance) + pointsToEarn,
        total_earned: Number((existing as any).total_earned) + pointsToEarn,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", (existing as any).id);
  } else {
    await supabase.from("customer_loyalty").insert({
      customer_id: customerId,
      points_balance: pointsToEarn,
      total_earned: pointsToEarn,
    } as any);
  }

  await supabase.from("loyalty_transactions").insert({
    customer_id: customerId,
    order_id: orderId,
    type: "earn",
    points: pointsToEarn,
    remaining_points: pointsToEarn,
    expires_at: expiresAt,
    description: `Earned ${pointsToEarn} points from order`,
  } as any);
}

/**
 * Redeem loyalty points (FIFO consumption of non-expired earn rows, soonest-to-expire first).
 */
export async function redeemLoyaltyPoints(
  customerId: string,
  orderId: string,
  pointsToRedeem: number,
  discountAmount: number
) {
  if (pointsToRedeem <= 0) return;

  // Pull non-expired earn rows with remaining > 0, soonest-to-expire first (then oldest).
  const { data: earnRows } = await supabase
    .from("loyalty_transactions")
    .select("id, remaining_points, expires_at, created_at")
    .eq("customer_id", customerId)
    .eq("type", "earn")
    .gt("remaining_points", 0)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const rows = (earnRows || []) as any[];
  const totalAvailable = rows.reduce((s, r) => s + Number(r.remaining_points || 0), 0);
  if (totalAvailable < pointsToRedeem) return;

  let remainingToConsume = pointsToRedeem;
  for (const r of rows) {
    if (remainingToConsume <= 0) break;
    const take = Math.min(Number(r.remaining_points), remainingToConsume);
    const newRemaining = Number((Number(r.remaining_points) - take).toFixed(2));
    await supabase
      .from("loyalty_transactions")
      .update({ remaining_points: newRemaining } as any)
      .eq("id", r.id);
    remainingToConsume = Number((remainingToConsume - take).toFixed(2));
  }

  // Update cache
  const { data: existing } = await supabase
    .from("customer_loyalty")
    .select("id, points_balance, total_redeemed")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("customer_loyalty")
      .update({
        points_balance: Math.max(0, Number((existing as any).points_balance) - pointsToRedeem),
        total_redeemed: Number((existing as any).total_redeemed) + pointsToRedeem,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", (existing as any).id);
  }

  await supabase.from("loyalty_transactions").insert({
    customer_id: customerId,
    order_id: orderId,
    type: "redeem",
    points: pointsToRedeem,
    remaining_points: 0,
    description: `Redeemed ${pointsToRedeem} points for ${discountAmount} OMR discount`,
  } as any);
}
