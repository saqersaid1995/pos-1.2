-- Loyalty settings (singleton row)
CREATE TABLE public.loyalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT false,
  earn_points_rate numeric NOT NULL DEFAULT 1,
  redeem_points_rate numeric NOT NULL DEFAULT 50,
  max_redemption_percent numeric NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read loyalty_settings" ON public.loyalty_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can update loyalty_settings" ON public.loyalty_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert loyalty_settings" ON public.loyalty_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.loyalty_settings (is_enabled, earn_points_rate, redeem_points_rate, max_redemption_percent) VALUES (false, 1, 50, 20);

-- Customer loyalty balances
CREATE TABLE public.customer_loyalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points_balance numeric NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  total_redeemed numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

ALTER TABLE public.customer_loyalty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read customer_loyalty" ON public.customer_loyalty FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert customer_loyalty" ON public.customer_loyalty FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update customer_loyalty" ON public.customer_loyalty FOR UPDATE TO authenticated USING (true);

-- Loyalty transactions log
CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'earn',
  points numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read loyalty_transactions" ON public.loyalty_transactions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert loyalty_transactions" ON public.loyalty_transactions FOR INSERT TO authenticated WITH CHECK (true);