ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
CHECK (source_type = ANY (ARRAY['manual','order','payment','expense','expense_payment','opening','fixed_asset_purchase','fixed_asset_depreciation','loan_disbursement','loan_opening','loan_payment','cash_transfer']));