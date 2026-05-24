
-- Menu items table
CREATE TABLE public.whatsapp_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_number integer NOT NULL,
  label_ar text NOT NULL DEFAULT '',
  label_en text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'static_reply',
  reply_key text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read whatsapp_menu_items" ON public.whatsapp_menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert whatsapp_menu_items" ON public.whatsapp_menu_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update whatsapp_menu_items" ON public.whatsapp_menu_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete whatsapp_menu_items" ON public.whatsapp_menu_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Static replies table
CREATE TABLE public.whatsapp_static_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_key text NOT NULL UNIQUE,
  message_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_static_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read whatsapp_static_replies" ON public.whatsapp_static_replies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert whatsapp_static_replies" ON public.whatsapp_static_replies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update whatsapp_static_replies" ON public.whatsapp_static_replies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete whatsapp_static_replies" ON public.whatsapp_static_replies FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Conversation state tracking
CREATE TABLE public.whatsapp_conversation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'main_menu',
  menu_sent boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read whatsapp_conversation_state" ON public.whatsapp_conversation_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anon can insert whatsapp_conversation_state" ON public.whatsapp_conversation_state FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update whatsapp_conversation_state" ON public.whatsapp_conversation_state FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth can insert whatsapp_conversation_state" ON public.whatsapp_conversation_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update whatsapp_conversation_state" ON public.whatsapp_conversation_state FOR UPDATE TO authenticated USING (true);

-- Complaints table
CREATE TABLE public.whatsapp_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  customer_id uuid,
  message text NOT NULL DEFAULT '',
  attachment_url text,
  status text NOT NULL DEFAULT 'new',
  internal_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read whatsapp_complaints" ON public.whatsapp_complaints FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anon can insert whatsapp_complaints" ON public.whatsapp_complaints FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth can insert whatsapp_complaints" ON public.whatsapp_complaints FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update whatsapp_complaints" ON public.whatsapp_complaints FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete whatsapp_complaints" ON public.whatsapp_complaints FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-reply settings
CREATE TABLE public.whatsapp_auto_reply_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_mode boolean NOT NULL DEFAULT true,
  test_number text DEFAULT '',
  production_mode boolean NOT NULL DEFAULT false,
  greeting_message text NOT NULL DEFAULT 'أهلاً بك في Lavanderia
الرجاء اختيار الخدمة بإرسال الرقم:',
  fallback_message text NOT NULL DEFAULT 'عذراً، لم أفهم طلبك. الرجاء إرسال رقم من القائمة أو إرسال 0 للعودة.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_auto_reply_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read whatsapp_auto_reply_settings" ON public.whatsapp_auto_reply_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert whatsapp_auto_reply_settings" ON public.whatsapp_auto_reply_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update whatsapp_auto_reply_settings" ON public.whatsapp_auto_reply_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed default static replies
INSERT INTO public.whatsapp_static_replies (reply_key, message_text) VALUES
  ('working_hours', 'أوقات العمل:
السبت - الخميس: 8 صباحاً - 10 مساءً
الجمعة: 2 ظهراً - 10 مساءً'),
  ('pricing', 'للاطلاع على الأسعار، يرجى زيارة الفرع أو التواصل مع الموظف.'),
  ('complaint_prompt', 'يرجى إرسال شكواك أو ملاحظتك، ويمكنك إرفاق صورة.'),
  ('human_handover', 'تم تحويلك للتحدث مع أحد الموظفين. سيتم الرد عليك في أقرب وقت.'),
  ('order_lookup_prompt', 'يرجى إرسال رقم الطلب للاستعلام.');

-- Seed default menu items
INSERT INTO public.whatsapp_menu_items (menu_number, label_ar, label_en, action_type, reply_key, sort_order) VALUES
  (1, 'الاستعلام عن الطلب', 'Order Lookup', 'order_lookup', 'order_lookup_prompt', 1),
  (2, 'أوقات العمل', 'Working Hours', 'static_reply', 'working_hours', 2),
  (3, 'الأسعار', 'Pricing', 'static_reply', 'pricing', 3),
  (4, 'الشكاوى والبلاغات', 'Complaints', 'complaint_flow', 'complaint_prompt', 4),
  (5, 'التحدث مع الموظف', 'Human Support', 'human_handover', 'human_handover', 5);

-- Seed default settings
INSERT INTO public.whatsapp_auto_reply_settings (test_mode, production_mode) VALUES (true, false);
