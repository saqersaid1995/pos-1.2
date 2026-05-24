CREATE TABLE public.opening_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type text NOT NULL CHECK (account_type IN ('cash','bank')),
  amount numeric NOT NULL DEFAULT 0,
  as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (account_type)
);

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read opening_balances" ON public.opening_balances FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anon can insert opening_balances" ON public.opening_balances FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update opening_balances" ON public.opening_balances FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete opening_balances" ON public.opening_balances FOR DELETE TO anon USING (true);
CREATE POLICY "Auth can insert opening_balances" ON public.opening_balances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update opening_balances" ON public.opening_balances FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth can delete opening_balances" ON public.opening_balances FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_opening_balances_updated_at
BEFORE UPDATE ON public.opening_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();