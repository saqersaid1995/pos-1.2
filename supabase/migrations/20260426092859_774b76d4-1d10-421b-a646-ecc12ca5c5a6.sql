-- Update pl_line CHECK constraint to use the new Income Statement line items
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_pl_line_check;

-- Backfill existing pl_line values to the new schema
UPDATE public.expenses SET pl_line = CASE
  WHEN pl_line = 'cogs' THEN 'cogs'
  WHEN pl_line IN ('salaries','rent','utilities','maintenance','supplies','other_opex') THEN 'sga_admin'
  WHEN pl_line = 'depreciation' THEN 'depreciation'
  WHEN pl_line = 'interest' THEN 'interest_expense'
  WHEN pl_line = 'other_income' THEN 'other_income'
  ELSE 'sga_admin'
END;

-- New constraint with the exact line items requested
ALTER TABLE public.expenses
ADD CONSTRAINT expenses_pl_line_check CHECK (
  pl_line IN (
    'revenue',
    'cogs',
    'sga_admin',
    'other_operating_income',
    'depreciation',
    'interest_expense',
    'interest_income',
    'other_income',
    'tax_provision'
  )
);

-- Update default
ALTER TABLE public.expenses ALTER COLUMN pl_line SET DEFAULT 'sga_admin';
