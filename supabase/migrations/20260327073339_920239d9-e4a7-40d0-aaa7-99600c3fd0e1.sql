
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'incoming',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  wa_message_id text,
  message_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert whatsapp_messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon can read whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert whatsapp_messages" ON public.whatsapp_messages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Admins can delete whatsapp_messages" ON public.whatsapp_messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update whatsapp_messages" ON public.whatsapp_messages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX idx_whatsapp_messages_customer_id ON public.whatsapp_messages(customer_id);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
