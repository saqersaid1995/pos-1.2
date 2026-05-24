ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS pl_line text NOT NULL DEFAULT 'other_opex';

ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_pl_line_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_pl_line_check CHECK (
  pl_line IN (
    'cogs','salaries','rent','utilities','maintenance','supplies',
    'other_opex','depreciation','interest','other_income'
  )
);

-- Backfill from previous income_category where possible
UPDATE public.expenses SET pl_line = CASE
  WHEN income_category = 'cogs' THEN 'cogs'
  WHEN income_category = 'salaries' THEN 'salaries'
  WHEN income_category = 'rent' THEN 'rent'
  WHEN income_category = 'utilities' THEN 'utilities'
  WHEN income_category = 'marketing' THEN 'other_opex'
  WHEN income_category = 'depreciation' THEN 'depreciation'
  WHEN income_category = 'interest' THEN 'interest'
  WHEN income_category = 'non_operating' THEN 'other_income'
  ELSE 'other_opex'
END;

CREATE INDEX IF NOT EXISTS idx_expenses_pl_line ON public.expenses(pl_line);