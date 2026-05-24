
-- Extend notification_logs with dashboard fields
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outgoing',
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS template_category text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'OMR';

CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON public.notification_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_provider_message_id ON public.notification_logs (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_send_status ON public.notification_logs (send_status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_template_name ON public.notification_logs (template_name);

-- Backfill template_name from message_type for legacy rows
UPDATE public.notification_logs
SET template_name = COALESCE(template_name,
  CASE
    WHEN message_type = 'ready_for_pickup' THEN 'order_ready_pdf_ar'
    WHEN message_type ILIKE '%loyalty%progress%' THEN 'loyalty_progress_update_ar'
    WHEN message_type ILIKE '%loyalty%redeem%' THEN 'loyalty_ready_to_redeem_ar'
    WHEN message_type ILIKE '%payment%' THEN 'payment_reminder_ar'
    ELSE NULL
  END),
  template_language = COALESCE(template_language, 'ar'),
  template_category = COALESCE(template_category, 'utility'),
  event_type = COALESCE(event_type,
    CASE
      WHEN message_type = 'ready_for_pickup' THEN 'event_order_ready'
      WHEN message_type ILIKE '%loyalty%' THEN 'event_loyalty'
      WHEN message_type ILIKE '%payment%' THEN 'event_payment_reminder'
      ELSE NULL
    END);

-- Add cost rate config to whatsapp_settings
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS cost_rates jsonb NOT NULL DEFAULT '{
    "utility": 0.005,
    "marketing": 0.025,
    "service": 0.000,
    "authentication": 0.005,
    "default": 0.005,
    "currency": "OMR"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS outstanding_unpaid_cost numeric NOT NULL DEFAULT 0;
