CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_api_version text NOT NULL DEFAULT 'v18.0',
  default_country_code text NOT NULL DEFAULT '968',
  business_name text NOT NULL DEFAULT 'Lavinderia',
  business_logo_url text NOT NULL DEFAULT '',
  invoice_footer_text text NOT NULL DEFAULT '',
  default_invoice_language text NOT NULL DEFAULT 'ar',
  receipt_size text NOT NULL DEFAULT 'A4',
  include_qr boolean NOT NULL DEFAULT true,
  templates jsonb NOT NULL DEFAULT '{
    "tpl_order_ready":      {"name":"order_ready_pdf_ar",        "language":"ar","enabled":true,"params":["customer_name","order_number","total_amount"]},
    "tpl_loyalty_progress": {"name":"loyalty_progress_update_ar","language":"ar","enabled":true,"params":["points_earned","total_points","remaining_to_redeem"]},
    "tpl_loyalty_redeem":   {"name":"loyalty_ready_to_redeem_ar","language":"ar","enabled":true,"params":["total_points","max_redemption_pct"]},
    "tpl_payment_reminder": {"name":"",                          "language":"ar","enabled":false,"params":["customer_name","order_number","remaining_amount"]}
  }'::jsonb,
  event_mapping jsonb NOT NULL DEFAULT '{
    "event_order_ready":"tpl_order_ready",
    "event_payment_completed":"tpl_loyalty_progress",
    "event_manual_resend":"tpl_order_ready",
    "event_payment_reminder":"tpl_payment_reminder"
  }'::jsonb,
  incoming_enabled boolean NOT NULL DEFAULT true,
  auto_reply_enabled boolean NOT NULL DEFAULT true,
  push_notifications_enabled boolean NOT NULL DEFAULT true,
  unread_badge_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read whatsapp_settings" ON public.whatsapp_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can insert whatsapp_settings" ON public.whatsapp_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update whatsapp_settings" ON public.whatsapp_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.whatsapp_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;