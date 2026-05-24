import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppTemplate {
  name: string;
  language: string;
  enabled: boolean;
  params: string[];
}

export interface WhatsAppSettingsRow {
  id: string;
  graph_api_version: string;
  default_country_code: string;
  business_name: string;
  business_logo_url: string;
  invoice_footer_text: string;
  default_invoice_language: string;
  receipt_size: string;
  include_qr: boolean;
  templates: Record<string, WhatsAppTemplate>;
  event_mapping: Record<string, string>;
  incoming_enabled: boolean;
  auto_reply_enabled: boolean;
  push_notifications_enabled: boolean;
  unread_badge_enabled: boolean;
  cost_rates: {
    utility?: number;
    marketing?: number;
    service?: number;
    authentication?: number;
    default?: number;
    currency?: string;
  };
  outstanding_unpaid_cost: number;
}

export const TEMPLATE_KEYS = [
  { key: "tpl_order_ready", label: "Order Ready + PDF Invoice" },
  { key: "tpl_loyalty_progress", label: "Loyalty Progress" },
  { key: "tpl_loyalty_redeem", label: "Loyalty Ready to Redeem" },
  { key: "tpl_payment_reminder", label: "Future Payment Reminder" },
] as const;

export const EVENT_KEYS = [
  { key: "event_order_ready", label: "Order status → Ready for Pickup" },
  { key: "event_payment_completed", label: "Payment completed" },
  { key: "event_manual_resend", label: "Manual resend invoice" },
  { key: "event_payment_reminder", label: "Future payment reminder" },
] as const;

export async function fetchSettings(): Promise<WhatsAppSettingsRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_settings" as any)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("fetchSettings error", error);
    return null;
  }
  return data as any;
}

export async function updateSettings(id: string, patch: Partial<WhatsAppSettingsRow>) {
  const { error } = await supabase
    .from("whatsapp_settings" as any)
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function callAdmin(action: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatsapp-admin", {
    body: { action, ...(body || {}) },
  });
  if (error) throw error;
  return data;
}

/* ───────── Country code CRUD ───────── */

export interface CountryCodeRow {
  id: string;
  country_name: string;
  country_code: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export async function listCountryCodes(): Promise<CountryCodeRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_country_codes" as any)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listCountryCodes", error);
    return [];
  }
  return (data as any) || [];
}

export async function createCountryCode(row: Omit<CountryCodeRow, "id">) {
  const { error } = await supabase.from("whatsapp_country_codes" as any).insert(row as any);
  if (error) throw error;
}

export async function updateCountryCode(id: string, patch: Partial<CountryCodeRow>) {
  const { error } = await supabase
    .from("whatsapp_country_codes" as any)
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCountryCode(id: string) {
  const { error } = await supabase.from("whatsapp_country_codes" as any).delete().eq("id", id);
  if (error) throw error;
}

/** Atomically set one country code as default (clears others). */
export async function setDefaultCountryCode(id: string) {
  // Two-step: clear all, then set one. RLS will be evaluated per row.
  const { error: e1 } = await supabase
    .from("whatsapp_country_codes" as any)
    .update({ is_default: false } as any)
    .neq("id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("whatsapp_country_codes" as any)
    .update({ is_default: true } as any)
    .eq("id", id);
  if (e2) throw e2;
}
