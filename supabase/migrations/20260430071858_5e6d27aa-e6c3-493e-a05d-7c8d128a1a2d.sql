
-- ============================================================
-- FIXED ASSETS MODULE
-- ============================================================

-- 1) Seed missing CoA accounts (idempotent)
INSERT INTO public.chart_of_accounts (code, account_name, account_type, sub_type, normal_balance, classification_type, is_system, description)
VALUES
  ('1515', 'Accumulated Depreciation - Equipment', 'Asset', 'contra_asset', 'credit', 'non_current_asset', true, 'Contra-asset reducing Laundry Equipment'),
  ('1525', 'Accumulated Depreciation - Furniture', 'Asset', 'contra_asset', 'credit', 'non_current_asset', true, 'Contra-asset reducing Furniture & Fixtures'),
  ('1590', 'Other Fixed Assets', 'Asset', 'fixed_asset', 'debit', 'non_current_asset', true, 'Other long-term tangible assets'),
  ('1595', 'Accumulated Depreciation - Other', 'Asset', 'contra_asset', 'credit', 'non_current_asset', true, 'Contra-asset reducing Other Fixed Assets'),
  ('5110', 'Depreciation Expense', 'Expense', 'operating_expense', 'debit', 'expense', true, 'Monthly depreciation of fixed assets')
ON CONFLICT (code) DO NOTHING;

-- 2) fixed_assets table
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text NOT NULL,
  category text NOT NULL DEFAULT 'Equipment', -- Equipment | Furniture | Other
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  useful_life_years numeric NOT NULL DEFAULT 5 CHECK (useful_life_years > 0),
  residual_value numeric NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  depreciation_method text NOT NULL DEFAULT 'straight_line',
  funding_source text NOT NULL DEFAULT 'equity', -- equity | cash | bank | loan
  asset_account_code text NOT NULL DEFAULT '1510',
  contra_account_code text NOT NULL DEFAULT '1515',
  expense_account_code text NOT NULL DEFAULT '5110',
  invoice_url text DEFAULT '',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active', -- active | disposed
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_active ON public.fixed_assets(is_deleted, status);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fixed_assets" ON public.fixed_assets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert fixed_assets" ON public.fixed_assets
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update fixed_assets" ON public.fixed_assets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete fixed_assets" ON public.fixed_assets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_fixed_assets_updated
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) depreciation_entries table (one row per asset per month posted)
CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_month date NOT NULL, -- first day of month
  amount numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON public.depreciation_entries(asset_id);

ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read depreciation_entries" ON public.depreciation_entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage depreciation_entries" ON public.depreciation_entries
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Mapping helpers
CREATE OR REPLACE FUNCTION public.fixed_asset_category_to_codes(_category text)
RETURNS TABLE(asset_code text, contra_code text)
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT
    CASE _category
      WHEN 'Equipment' THEN '1510'
      WHEN 'Furniture' THEN '1520'
      ELSE '1590'
    END,
    CASE _category
      WHEN 'Equipment' THEN '1515'
      WHEN 'Furniture' THEN '1525'
      ELSE '1595'
    END;
$$;

CREATE OR REPLACE FUNCTION public.funding_source_to_account_code(_source text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE lower(_source)
    WHEN 'cash' THEN '1010'
    WHEN 'bank' THEN '1020'
    WHEN 'loan' THEN '2110'   -- non-current liability: Bank Loan
    ELSE '3010'               -- equity: Owner's Capital
  END;
$$;

-- 5) Purchase JE poster
CREATE OR REPLACE FUNCTION public.post_fixed_asset_purchase_je(_asset_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  a public.fixed_assets;
  je_id uuid;
  asset_acc uuid;
  fund_acc uuid;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF NOT FOUND OR a.is_deleted OR COALESCE(a.cost,0) <= 0 THEN RETURN NULL; END IF;

  -- Remove any prior purchase entry for this asset
  PERFORM public.delete_system_entries('fixed_asset_purchase', a.id);

  asset_acc := public.get_account_id(a.asset_account_code);
  fund_acc  := public.get_account_id(public.funding_source_to_account_code(a.funding_source));
  IF asset_acc IS NULL OR fund_acc IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (a.purchase_date, 'fixed_asset_purchase', a.id, 'Fixed asset purchase: ' || a.asset_name, true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, asset_acc, a.cost, a.category || ' - ' || a.asset_name);

  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, fund_acc, a.cost, 'Funded by ' || a.funding_source);

  RETURN je_id;
END;
$$;

-- 6) Trigger: post purchase JE when asset created/changed; remove on delete
CREATE OR REPLACE FUNCTION public.trg_fixed_asset_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('fixed_asset_purchase', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- depreciation JEs are tied via source_id too
    DELETE FROM public.journal_entries WHERE source_type = 'fixed_asset_depreciation' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.is_deleted THEN
    DELETE FROM public.journal_entries WHERE source_type = 'fixed_asset_depreciation' AND source_id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM public.post_fixed_asset_purchase_je(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fixed_assets_je ON public.fixed_assets;
CREATE TRIGGER trg_fixed_assets_je
  AFTER INSERT OR UPDATE OR DELETE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fixed_asset_changed();

-- 7) Depreciation engine
-- Posts one JE per asset per month for any unposted month from
-- (purchase_month) through _up_to_month (inclusive). Straight-line.
CREATE OR REPLACE FUNCTION public.run_depreciation(_up_to_month date DEFAULT NULL)
RETURNS TABLE(asset_id uuid, posted_count int, total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  a record;
  target_month date;
  m date;
  monthly_amt numeric;
  depreciable numeric;
  total_months int;
  posted_so_far int;
  je_id uuid;
  exp_acc uuid;
  contra_acc uuid;
  posted int;
  sum_amt numeric;
  start_month date;
BEGIN
  target_month := date_trunc('month', COALESCE(_up_to_month, CURRENT_DATE))::date;

  FOR a IN SELECT * FROM public.fixed_assets WHERE NOT is_deleted AND status = 'active' AND cost > 0
  LOOP
    depreciable := GREATEST(a.cost - COALESCE(a.residual_value,0), 0);
    total_months := GREATEST(ROUND(a.useful_life_years * 12)::int, 1);
    monthly_amt := ROUND((depreciable / total_months)::numeric, 3);

    SELECT COUNT(*) INTO posted_so_far FROM public.depreciation_entries WHERE depreciation_entries.asset_id = a.id;
    IF posted_so_far >= total_months THEN CONTINUE; END IF;

    exp_acc := public.get_account_id(a.expense_account_code);
    contra_acc := public.get_account_id(a.contra_account_code);
    IF exp_acc IS NULL OR contra_acc IS NULL THEN CONTINUE; END IF;

    -- Start from the month AFTER purchase_month (mid-month convention: purchase month not depreciated)
    -- Simpler: start from purchase month itself
    start_month := date_trunc('month', a.purchase_date)::date;
    m := start_month;
    posted := 0;
    sum_amt := 0;

    WHILE m <= target_month AND posted_so_far < total_months LOOP
      -- skip if already posted
      IF NOT EXISTS (SELECT 1 FROM public.depreciation_entries WHERE depreciation_entries.asset_id = a.id AND period_month = m) THEN
        -- final month adjustment to fully amortize
        IF posted_so_far = total_months - 1 THEN
          monthly_amt := depreciable - (monthly_amt * posted_so_far);
          IF monthly_amt < 0 THEN monthly_amt := 0; END IF;
        END IF;

        IF monthly_amt > 0 THEN
          INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
          VALUES ((m + INTERVAL '1 month - 1 day')::date, 'fixed_asset_depreciation', a.id,
                  'Depreciation: ' || a.asset_name || ' (' || to_char(m,'Mon YYYY') || ')', true)
          RETURNING id INTO je_id;

          INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
          VALUES (je_id, exp_acc, monthly_amt, 'Depreciation expense');
          INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
          VALUES (je_id, contra_acc, monthly_amt, 'Accumulated depreciation');

          INSERT INTO public.depreciation_entries (asset_id, period_month, amount, journal_entry_id)
          VALUES (a.id, m, monthly_amt, je_id);

          posted := posted + 1;
          posted_so_far := posted_so_far + 1;
          sum_amt := sum_amt + monthly_amt;
        END IF;
      END IF;
      m := (m + INTERVAL '1 month')::date;
    END LOOP;

    asset_id := a.id;
    posted_count := posted;
    total_amount := sum_amt;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 8) Storage bucket for invoices (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fixed-asset-invoices', 'fixed-asset-invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth read fixed-asset-invoices" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'fixed-asset-invoices');
CREATE POLICY "Admins write fixed-asset-invoices" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fixed-asset-invoices' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update fixed-asset-invoices" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'fixed-asset-invoices' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete fixed-asset-invoices" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'fixed-asset-invoices' AND public.has_role(auth.uid(), 'admin'::app_role));
