-- Add income_category column to expenses for Income Statement mapping
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS income_category text NOT NULL DEFAULT 'other_opex';

-- Add a check constraint for valid income categories
ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_income_category_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_income_category_check CHECK (
  income_category IN (
    'cogs',
    'salaries',
    'rent',
    'utilities',
    'marketing',
    'other_opex',
    'depreciation',
    'interest',
    'non_operating'
  )
);

-- Auto-map existing expenses to sensible income categories based on current category
UPDATE public.expenses SET income_category = CASE
  WHEN category = 'Salaries' THEN 'salaries'
  WHEN category = 'Rent' THEN 'rent'
  WHEN category = 'Utilities' THEN 'utilities'
  WHEN category = 'Marketing' THEN 'marketing'
  WHEN category = 'Loan' THEN 'interest'
  WHEN category = 'Supplies' THEN 'cogs'
  WHEN category = 'Maintenance' THEN 'other_opex'
  WHEN category = 'Fuel' THEN 'other_opex'
  ELSE 'other_opex'
END
WHERE income_category = 'other_opex';

-- Index for fast filtering by income category
CREATE INDEX IF NOT EXISTS idx_expenses_income_category ON public.expenses(income_category);