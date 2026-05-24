-- 1. Add classification_type column
ALTER TABLE public.chart_of_accounts
ADD COLUMN IF NOT EXISTS classification_type text;

-- 2. Backfill classification for existing accounts based on code/type
UPDATE public.chart_of_accounts SET classification_type = CASE
  -- Current Assets: Cash, Bank, AR, Inventory, Prepaid (1000-1499)
  WHEN account_type = 'Asset' AND code ~ '^1[0-4]' THEN 'current_asset'
  -- Non-current assets: Equipment, Fixtures, etc. (1500+)
  WHEN account_type = 'Asset' THEN 'non_current_asset'
  -- Current Liabilities: AP, accrued, short-term (2000-2499)
  WHEN account_type = 'Liability' AND code ~ '^2[0-4]' THEN 'current_liability'
  WHEN account_type = 'Liability' THEN 'non_current_liability'
  WHEN account_type = 'Equity' THEN 'equity'
  WHEN account_type = 'Revenue' THEN 'revenue'
  WHEN account_type = 'Expense' THEN 'expense'
  ELSE NULL
END
WHERE classification_type IS NULL;

-- 3. Make column NOT NULL with default
ALTER TABLE public.chart_of_accounts
ALTER COLUMN classification_type SET DEFAULT 'expense',
ALTER COLUMN classification_type SET NOT NULL;

-- 4. Add check constraint
ALTER TABLE public.chart_of_accounts
DROP CONSTRAINT IF EXISTS chart_of_accounts_classification_check;
ALTER TABLE public.chart_of_accounts
ADD CONSTRAINT chart_of_accounts_classification_check
CHECK (classification_type IN ('current_asset','non_current_asset','current_liability','non_current_liability','equity','revenue','expense'));

-- 5. Seed new non-current accounts (idempotent)
INSERT INTO public.chart_of_accounts (code, account_name, account_type, sub_type, normal_balance, classification_type, is_system, is_active, description)
VALUES
  ('1510', 'Laundry Equipment', 'Asset', 'Property, Plant & Equipment', 'debit', 'non_current_asset', true, true, 'Washing machines, dryers, and related laundry equipment'),
  ('1520', 'Furniture & Fixtures', 'Asset', 'Property, Plant & Equipment', 'debit', 'non_current_asset', true, true, 'Office and shop furniture and fixtures'),
  ('2510', 'Bank Loan', 'Liability', 'Long-term Debt', 'credit', 'non_current_liability', true, true, 'Long-term bank loans payable')
ON CONFLICT (code) DO UPDATE SET
  classification_type = EXCLUDED.classification_type,
  sub_type = EXCLUDED.sub_type;