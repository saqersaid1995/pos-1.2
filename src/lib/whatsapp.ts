import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface SendWhatsAppParams {
  orderId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  totalAmount: number;
  remainingAmount: number;
}

export async function sendReadyForPickupWhatsApp(params: SendWhatsAppParams): Promise<{
  success: boolean;
  status: "sent" | "failed" | "skipped";
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        order_id: params.orderId,
        customer_id: params.customerId || null,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        order_number: params.orderNumber,
        total_amount: params.totalAmount,
        remaining_amount: params.remainingAmount,
        message_type: "ready_for_pickup",
        template_name: "order_ready_pdf_ar",
        template_language: "ar",
      },
    });

    if (error) {
      console.error("WhatsApp invoke error:", error);
      return { success: false, status: "failed", error: error.message };
    }

    return data as { success: boolean; status: "sent" | "failed" | "skipped"; error?: string };
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return { success: false, status: "failed", error: String(err) };
  }
}

interface SendLoyaltyWhatsAppParams {
  orderId: string;
  customerId: string;
  customerPhone: string;
  pointsEarned: number;
  totalPoints: number;
  minRedeemPoints: number;
  remainingToRedeem: number;
  maxRedemptionPct: number;
  templateType: "progress" | "ready_to_redeem";
}

export async function sendLoyaltyWhatsApp(params: SendLoyaltyWhatsAppParams): Promise<{
  success: boolean;
  status: "sent" | "failed" | "skipped";
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-whatsapp-loyalty", {
      body: {
        order_id: params.orderId,
        customer_id: params.customerId,
        customer_phone: params.customerPhone,
        points_earned: params.pointsEarned,
        total_points: params.totalPoints,
        min_redeem_points: params.minRedeemPoints,
        remaining_to_redeem: params.remainingToRedeem,
        max_redemption_pct: params.maxRedemptionPct,
        template_type: params.templateType,
      },
    });

    if (error) {
      console.error("Loyalty WhatsApp invoke error:", error);
      return { success: false, status: "failed", error: error.message };
    }

    return data as { success: boolean; status: "sent" | "failed" | "skipped"; error?: string };
  } catch (err) {
    console.error("Loyalty WhatsApp send error:", err);
    return { success: false, status: "failed", error: String(err) };
  }
}

export async function fetchNotificationLogs(orderId: string) {
  const { data, error } = await supabase
    .from("notification_logs" as any)
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchNotificationLogs error:", error);
    return [];
  }
  return data || [];
}
