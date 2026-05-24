
-- Create notification_logs table
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient_phone text NOT NULL,
  message_type text NOT NULL DEFAULT 'ready_for_pickup',
  message_body text,
  send_status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  provider_response text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read notification_logs" ON public.notification_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert notification_logs" ON public.notification_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update notification_logs" ON public.notification_logs FOR UPDATE TO anon USING (true);
CREATE POLICY "Authenticated can read notification_logs" ON public.notification_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert notification_logs" ON public.notification_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update notification_logs" ON public.notification_logs FOR UPDATE TO authenticated USING (true);

-- Add whatsapp sent flag to orders
ALTER TABLE public.orders ADD COLUMN ready_pickup_whatsapp_sent boolean NOT NULL DEFAULT false;
