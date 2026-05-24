-- 1. Add lifecycle columns to expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount numeric NOT NULL DEFAULT 0;

-- Default due_date = expense_date for any rows missing it
UPDATE public.expenses SET due_date = expense_date WHERE due_date IS NULL;

-- 2. Create expense_payments table for partial payments
CREATE TABLE IF NOT EXISTS public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_source text NOT NULL DEFAULT 'cash',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_payments_expense_id ON public.expense_payments(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_payments_date ON public.expense_payments(payment_date);

ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read expense_payments" ON public.expense_payments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert expense_payments" ON public.expense_payments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update expense_payments" ON public.expense_payments FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete expense_payments" ON public.expense_payments FOR DELETE TO anon, authenticated USING (true);

-- 3. Backfill: for currently 'paid' expenses (excluding recurring templates),
-- set paid_amount = amount, remaining = 0, and create one synthetic payment record.
UPDATE public.expenses
SET paid_amount = amount, remaining_amount = 0
WHERE expense_status = 'paid'
  AND (is_recurring = false OR is_auto_generated = true);

INSERT INTO public.expense_payments (expense_id, amount, payment_date, payment_source, notes)
SELECT e.id, e.amount, e.expense_date, COALESCE(e.payment_source, 'cash'), 'Backfilled from existing paid expense'
FROM public.expenses e
WHERE e.expense_status = 'paid'
  AND (e.is_recurring = false OR e.is_auto_generated = true)
  AND NOT EXISTS (SELECT 1 FROM public.expense_payments p WHERE p.expense_id = e.id);

-- For 'accrued' expenses: paid_amount=0, remaining=amount
UPDATE public.expenses
SET paid_amount = 0, remaining_amount = amount
WHERE expense_status = 'accrued'
  AND (is_recurring = false OR is_auto_generated = true);

-- 4. Helper function to recompute expense status from payments (used by triggers)
CREATE OR REPLACE FUNCTION public.recompute_expense_lifecycle(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total_paid numeric;
  exp_amount numeric;
  new_status text;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.expense_payments
  WHERE expense_id = _expense_id;

  SELECT amount INTO exp_amount FROM public.expenses WHERE id = _expense_id;
  IF exp_amount IS NULL THEN RETURN; END IF;

  IF total_paid <= 0 THEN
    new_status := 'accrued';
  ELSIF total_paid + 0.001 < exp_amount THEN
    new_status := 'partial';
  ELSE
    new_status := 'paid';
  END IF;

  UPDATE public.expenses
  SET paid_amount = total_paid,
      remaining_amount = GREATEST(exp_amount - total_paid, 0),
      expense_status = new_status,
      updated_at = now()
  WHERE id = _expense_id;
END;
$$;

-- 5. Triggers to keep expense lifecycle in sync
CREATE OR REPLACE FUNCTION public.trg_expense_payment_changed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_expense_lifecycle(OLD.expense_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_expense_lifecycle(NEW.expense_id);
    IF TG_OP = 'UPDATE' AND NEW.expense_id <> OLD.expense_id THEN
      PERFORM public.recompute_expense_lifecycle(OLD.expense_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS expense_payment_lifecycle_sync ON public.expense_payments;
CREATE TRIGGER expense_payment_lifecycle_sync
AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_expense_payment_changed();