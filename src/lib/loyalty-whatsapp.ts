import { supabase } from "@/integrations/supabase/client";
import { sendLoyaltyWhatsApp } from "@/lib/whatsapp";

/**
 * Send loyalty WhatsApp after a payment is confirmed as "paid".
 * Decides which template to send:
 *  - loyalty_ready_to_redeem_ar  → if balance >= min redeem threshold
 *  - loyalty_progress_update_ar  → if balance < min redeem threshold
 * Only ONE template is sent per payment event.
 */
export async function triggerLoyaltyWhatsApp(
  orderId: string,
  customerId: string,
  customerPhone: string,
  paidAmount: number
) {
  try {
    // 1. Check loyalty settings
    const { data: settings } = await supabase
      .from("loyalty_settings")
      .select("is_enabled, earn_points_rate, redeem_points_rate, max_redemption_percent, min_redeem_points")
      .limit(1)
      .single();

    if (!(settings as any)?.is_enabled) return;

    const earnRate = (settings as any).earn_points_rate ?? 1;
    const minRedeemPts = (settings as any).min_redeem_points ?? 50;
    const maxPct = (settings as any).max_redemption_percent ?? 20;

    // 2. Check if already sent for this order
    const { data: order } = await supabase
      .from("orders")
      .select("loyalty_whatsapp_sent")
      .eq("id", orderId)
      .single();

    if ((order as any)?.loyalty_whatsapp_sent) return;

    // 3. Calculate points earned from this payment
    const pointsEarned = parseFloat((paidAmount * earnRate).toFixed(2));
    if (pointsEarned <= 0) return;

    // 4. Get customer's current loyalty balance (after earning was already applied)
    const { data: loyalty } = await supabase
      .from("customer_loyalty")
      .select("points_balance")
      .eq("customer_id", customerId)
      .maybeSingle();

    const totalPoints = parseFloat(((loyalty as any)?.points_balance ?? pointsEarned).toFixed(2));

    // 5. Determine which template to send
    const minRedeemPoints = minRedeemPts;
    const isEligibleToRedeem = totalPoints >= minRedeemPoints;

    if (isEligibleToRedeem) {
      // Send ready-to-redeem template (2 params: total_points, max_pct)
      const result = await sendLoyaltyWhatsApp({
        orderId,
        customerId,
        customerPhone,
        pointsEarned,
        totalPoints,
        minRedeemPoints,
        remainingToRedeem: 0,
        maxRedemptionPct: maxPct,
        templateType: "ready_to_redeem",
      });

      if (result.success) {
        console.log("Loyalty ready-to-redeem WhatsApp sent for order", orderId);
      } else {
        console.warn("Loyalty ready-to-redeem WhatsApp failed for order", orderId, result.error);
      }
    } else {
      // Send progress template (5 params)
      const remainingToRedeem = parseFloat((minRedeemPoints - totalPoints).toFixed(2));

      const result = await sendLoyaltyWhatsApp({
        orderId,
        customerId,
        customerPhone,
        pointsEarned,
        totalPoints,
        minRedeemPoints,
        remainingToRedeem,
        maxRedemptionPct: maxPct,
        templateType: "progress",
      });

      if (result.success) {
        console.log("Loyalty progress WhatsApp sent for order", orderId);
      } else {
        console.warn("Loyalty progress WhatsApp failed for order", orderId, result.error);
      }
    }
  } catch (err) {
    console.error("triggerLoyaltyWhatsApp error:", err);
  }
}
