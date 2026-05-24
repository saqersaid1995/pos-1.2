
ALTER TABLE public.expenses
  ADD COLUMN payment_source text NOT NULL DEFAULT 'cash',
  ADD COLUMN cash_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN bank_amount numeric NOT NULL DEFAULT 0;

-- Backfill existing expenses: assume all were cash
UPDATE public.expenses SET cash_amount = amount, bank_amount = 0, payment_source = 'cash';
