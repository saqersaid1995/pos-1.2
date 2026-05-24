
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_period TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read expenses" ON public.expenses FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert expenses" ON public.expenses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update expenses" ON public.expenses FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete expenses" ON public.expenses FOR DELETE TO anon USING (true);
CREATE POLICY "Authenticated can read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
