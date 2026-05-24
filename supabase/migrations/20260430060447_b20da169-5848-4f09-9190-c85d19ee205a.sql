-- =============================================================
-- ACCOUNTING SETTINGS (cutoff date)
-- =============================================================
CREATE TABLE public.accounting_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_start_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read accounting_settings" ON public.accounting_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert accounting_settings" ON public.accounting_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update accounting_settings" ON public.accounting_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_accounting_settings_updated
  BEFORE UPDATE ON public.accounting_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.accounting_settings (accounting_start_date) VALUES (CURRENT_DATE);

-- Helper: get current cutoff
CREATE OR REPLACE FUNCTION public.get_accounting_start_date()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT accounting_start_date FROM public.accounting_settings ORDER BY updated_at DESC LIMIT 1), CURRENT_DATE)
$$;

-- =============================================================
-- CHART OF ACCOUNTS
-- =============================================================
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('Asset','Liability','Equity','Revenue','Expense')),
  sub_type text NOT NULL DEFAULT '',
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read chart_of_accounts" ON public.chart_of_accounts
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert chart_of_accounts" ON public.chart_of_accounts
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update chart_of_accounts" ON public.chart_of_accounts
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete chart_of_accounts" ON public.chart_of_accounts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND is_system = false);

CREATE TRIGGER trg_coa_updated
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Protect system accounts from being deactivated/renamed in critical fields
CREATE OR REPLACE FUNCTION public.protect_system_coa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_system = true THEN
    IF NEW.code <> OLD.code OR NEW.account_type <> OLD.account_type OR NEW.normal_balance <> OLD.normal_balance THEN
      RAISE EXCEPTION 'Cannot modify code/type/normal_balance of system account %', OLD.code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_system_coa
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_coa();

-- Seed standard CoA
INSERT INTO public.chart_of_accounts (code, account_name, account_type, sub_type, normal_balance, is_system, description) VALUES
  -- Assets
  ('1010', 'Cash on Hand',           'Asset',     'Current Asset', 'debit',  true, 'Physical cash drawer'),
  ('1020', 'Bank Account',           'Asset',     'Current Asset', 'debit',  true, 'Business bank account'),
  ('1100', 'Accounts Receivable',    'Asset',     'Current Asset', 'debit',  true, 'Customer outstanding balances'),
  -- Liabilities
  ('2010', 'Accounts Payable',       'Liability', 'Current Liability', 'credit', true, 'Unpaid expenses owed to suppliers'),
  -- Equity
  ('3010', 'Owner''s Equity',        'Equity',    'Equity', 'credit', true, 'Owner contributions'),
  ('3020', 'Retained Earnings',      'Equity',    'Equity', 'credit', true, 'Accumulated profit'),
  -- Revenue
  ('4010', 'Service Revenue',        'Revenue',   'Operating Revenue', 'credit', true, 'Laundry service revenue'),
  ('4020', 'Customer Discounts',     'Revenue',   'Contra Revenue', 'debit', true, 'Discounts given to customers'),
  -- Expenses
  ('5010', 'Cost of Goods Sold',     'Expense',   'COGS', 'debit', true, 'Direct cost of services'),
  ('5020', 'Salaries Expense',       'Expense',   'Operating Expense', 'debit', true, 'Staff salaries'),
  ('5030', 'Rent Expense',           'Expense',   'Operating Expense', 'debit', true, 'Premises rent'),
  ('5040', 'Utilities Expense',      'Expense',   'Operating Expense', 'debit', true, 'Water, electricity, internet'),
  ('5050', 'Marketing Expense',      'Expense',   'Operating Expense', 'debit', true, 'Advertising and promotion'),
  ('5060', 'Supplies Expense',       'Expense',   'Operating Expense', 'debit', true, 'Detergents, hangers, plastic'),
  ('5070', 'Maintenance Expense',    'Expense',   'Operating Expense', 'debit', true, 'Equipment maintenance'),
  ('5080', 'Fuel Expense',           'Expense',   'Operating Expense', 'debit', true, 'Vehicle and machine fuel'),
  ('5090', 'Loan Interest Expense',  'Expense',   'Non-Operating Expense', 'debit', true, 'Interest on borrowings'),
  ('5099', 'Other Expense',          'Expense',   'Operating Expense', 'debit', true, 'Miscellaneous expenses');

-- =============================================================
-- JOURNAL ENTRIES
-- =============================================================
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','order','payment','expense','expense_payment','opening')),
  source_id uuid,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_je_date ON public.journal_entries(entry_date);
CREATE INDEX idx_je_source ON public.journal_entries(source_type, source_id);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read journal_entries" ON public.journal_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated insert journal_entries" ON public.journal_entries FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Admins update journal_entries" ON public.journal_entries FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND is_system = false);
CREATE POLICY "Admins delete journal_entries" ON public.journal_entries FOR DELETE TO authenticated, anon USING (true);

CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  debit_account_id uuid REFERENCES public.chart_of_accounts(id),
  credit_account_id uuid REFERENCES public.chart_of_accounts(id),
  amount numeric NOT NULL CHECK (amount >= 0),
  line_description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_account_id IS NOT NULL) <> (credit_account_id IS NOT NULL))
);
CREATE INDEX idx_jel_entry ON public.journal_entry_lines(entry_id);
CREATE INDEX idx_jel_debit ON public.journal_entry_lines(debit_account_id);
CREATE INDEX idx_jel_credit ON public.journal_entry_lines(credit_account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read journal_entry_lines" ON public.journal_entry_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone insert journal_entry_lines" ON public.journal_entry_lines FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Anyone delete journal_entry_lines" ON public.journal_entry_lines FOR DELETE TO authenticated, anon USING (true);

-- =============================================================
-- HELPER: get account id by code
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_account_id(_code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.chart_of_accounts WHERE code = _code LIMIT 1
$$;

-- Map expense category -> account code
CREATE OR REPLACE FUNCTION public.expense_category_to_account_code(_category text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _category
    WHEN 'Salaries'    THEN '5020'
    WHEN 'Rent'        THEN '5030'
    WHEN 'Utilities'   THEN '5040'
    WHEN 'Marketing'   THEN '5050'
    WHEN 'Supplies'    THEN '5060'
    WHEN 'Maintenance' THEN '5070'
    WHEN 'Fuel'        THEN '5080'
    WHEN 'Loan'        THEN '5090'
    ELSE '5099'
  END
$$;

-- Map payment method/source -> cash or bank account code
CREATE OR REPLACE FUNCTION public.payment_method_to_account_code(_method text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(_method)
    WHEN 'cash' THEN '1010'
    WHEN 'card' THEN '1020'
    WHEN 'bank' THEN '1020'
    WHEN 'transfer' THEN '1020'
    ELSE '1010'
  END
$$;

-- =============================================================
-- AUTO-POSTING TRIGGERS
-- =============================================================

-- Delete prior system entries for a given source (used before re-posting)
CREATE OR REPLACE FUNCTION public.delete_system_entries(_source_type text, _source_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.journal_entries WHERE source_type = _source_type AND source_id = _source_id AND is_system = true;
$$;

-- ORDERS: Revenue recognition (accrual)
CREATE OR REPLACE FUNCTION public.post_order_je()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  ar_id uuid := public.get_account_id('1100');
  rev_id uuid := public.get_account_id('4010');
  disc_id uuid := public.get_account_id('4020');
  je_id uuid;
  gross numeric;
  disc numeric;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('order', OLD.id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  -- Skip drafts, deleted, before cutoff, or zero
  IF NEW.is_draft OR NEW.is_deleted OR NEW.order_date < cutoff OR COALESCE(NEW.total_amount,0) <= 0 THEN
    RETURN NEW;
  END IF;

  gross := COALESCE(NEW.subtotal,0) + COALESCE(NEW.urgent_fee,0);
  disc := COALESCE(NEW.discount,0);

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (NEW.order_date, 'order', NEW.id, 'Revenue: Order ' || NEW.order_number, true)
  RETURNING id INTO je_id;

  -- DR AR for net total
  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, ar_id, NEW.total_amount, 'Receivable from customer');

  -- CR Revenue gross
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, rev_id, gross, 'Service revenue');

  -- DR Discounts (contra revenue) if any
  IF disc > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
    VALUES (je_id, disc_id, disc, 'Customer discount');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_order_je
  AFTER INSERT OR UPDATE OF total_amount, subtotal, discount, urgent_fee, order_date, is_draft, is_deleted OR DELETE
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.post_order_je();

-- PAYMENTS: Customer payment
CREATE OR REPLACE FUNCTION public.post_payment_je()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  ar_id uuid := public.get_account_id('1100');
  cash_id uuid;
  je_id uuid;
  pay_date date;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('payment', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  pay_date := (NEW.payment_date AT TIME ZONE 'Asia/Muscat')::date;
  IF pay_date < cutoff OR COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  cash_id := public.get_account_id(public.payment_method_to_account_code(NEW.payment_method));

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (pay_date, 'payment', NEW.id, 'Customer payment (' || NEW.payment_method || ')', true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, cash_id, NEW.amount, 'Cash/Bank received');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, ar_id, NEW.amount, 'Settle receivable');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_payment_je
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.post_payment_je();

-- EXPENSES: Accrual entry (DR Expense / CR AP). Skip recurring templates.
CREATE OR REPLACE FUNCTION public.post_expense_je()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  ap_id uuid := public.get_account_id('2010');
  exp_id uuid;
  je_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('expense', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  -- Skip recurring templates (they're definitions, not real liabilities)
  IF NEW.is_recurring AND NOT NEW.is_auto_generated THEN RETURN NEW; END IF;
  IF NEW.expense_date < cutoff OR COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  exp_id := public.get_account_id(public.expense_category_to_account_code(NEW.category));

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (NEW.expense_date, 'expense', NEW.id, 'Expense accrual: ' || NEW.category || ' - ' || COALESCE(NULLIF(NEW.description,''),'(no description)'), true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, exp_id, NEW.amount, NEW.category);
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, ap_id, NEW.amount, 'Accounts payable');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_expense_je
  AFTER INSERT OR UPDATE OF amount, expense_date, category, is_recurring, is_auto_generated OR DELETE
  ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.post_expense_je();

-- EXPENSE_PAYMENTS: Settle AP
CREATE OR REPLACE FUNCTION public.post_expense_payment_je()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  ap_id uuid := public.get_account_id('2010');
  cash_id uuid;
  je_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('expense_payment', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.payment_date < cutoff OR COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  cash_id := public.get_account_id(public.payment_method_to_account_code(NEW.payment_source));

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (NEW.payment_date, 'expense_payment', NEW.id, 'Expense payment (' || NEW.payment_source || ')', true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, ap_id, NEW.amount, 'Settle payable');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, cash_id, NEW.amount, 'Cash/Bank paid');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_expense_payment_je
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.post_expense_payment_je();

-- =============================================================
-- REBUILD / BACKFILL
-- =============================================================
CREATE OR REPLACE FUNCTION public.rebuild_accounting_from_cutoff()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  r record;
BEGIN
  -- Wipe all system-generated entries (cascades to lines)
  DELETE FROM public.journal_entries WHERE is_system = true;

  -- Replay orders
  FOR r IN SELECT * FROM public.orders
           WHERE NOT is_draft AND NOT is_deleted AND order_date >= cutoff AND COALESCE(total_amount,0) > 0
  LOOP
    PERFORM public.post_order_replay(r.id);
  END LOOP;

  -- Replay payments
  FOR r IN SELECT * FROM public.payments WHERE (payment_date AT TIME ZONE 'Asia/Muscat')::date >= cutoff AND amount > 0
  LOOP
    PERFORM public.post_payment_replay(r.id);
  END LOOP;

  -- Replay expenses (skip templates)
  FOR r IN SELECT * FROM public.expenses
           WHERE expense_date >= cutoff AND amount > 0
             AND NOT (is_recurring AND NOT is_auto_generated)
  LOOP
    PERFORM public.post_expense_replay(r.id);
  END LOOP;

  -- Replay expense payments
  FOR r IN SELECT * FROM public.expense_payments WHERE payment_date >= cutoff AND amount > 0
  LOOP
    PERFORM public.post_expense_payment_replay(r.id);
  END LOOP;
END;
$$;

-- Replay helpers (call the trigger logic manually)
CREATE OR REPLACE FUNCTION public.post_order_replay(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  ar_id uuid := public.get_account_id('1100');
  rev_id uuid := public.get_account_id('4010');
  disc_id uuid := public.get_account_id('4020');
  je_id uuid;
  gross numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  gross := COALESCE(o.subtotal,0) + COALESCE(o.urgent_fee,0);
  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (o.order_date, 'order', o.id, 'Revenue: Order ' || o.order_number, true) RETURNING id INTO je_id;
  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description) VALUES (je_id, ar_id, o.total_amount, 'Receivable');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description) VALUES (je_id, rev_id, gross, 'Service revenue');
  IF COALESCE(o.discount,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description) VALUES (je_id, disc_id, o.discount, 'Customer discount');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_payment_replay(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payments;
  ar_id uuid := public.get_account_id('1100');
  cash_id uuid;
  je_id uuid;
  pay_date date;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  pay_date := (p.payment_date AT TIME ZONE 'Asia/Muscat')::date;
  cash_id := public.get_account_id(public.payment_method_to_account_code(p.payment_method));
  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (pay_date, 'payment', p.id, 'Customer payment (' || p.payment_method || ')', true) RETURNING id INTO je_id;
  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description) VALUES (je_id, cash_id, p.amount, 'Cash/Bank in');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description) VALUES (je_id, ar_id, p.amount, 'Settle AR');
END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense_replay(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.expenses;
  ap_id uuid := public.get_account_id('2010');
  exp_id uuid;
  je_id uuid;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  exp_id := public.get_account_id(public.expense_category_to_account_code(e.category));
  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (e.expense_date, 'expense', e.id, 'Expense accrual: ' || e.category, true) RETURNING id INTO je_id;
  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description) VALUES (je_id, exp_id, e.amount, e.category);
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description) VALUES (je_id, ap_id, e.amount, 'AP');
END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense_payment_replay(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ep public.expense_payments;
  ap_id uuid := public.get_account_id('2010');
  cash_id uuid;
  je_id uuid;
BEGIN
  SELECT * INTO ep FROM public.expense_payments WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  cash_id := public.get_account_id(public.payment_method_to_account_code(ep.payment_source));
  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (ep.payment_date, 'expense_payment', ep.id, 'Expense payment (' || ep.payment_source || ')', true) RETURNING id INTO je_id;
  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description) VALUES (je_id, ap_id, ep.amount, 'Settle AP');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description) VALUES (je_id, cash_id, ep.amount, 'Cash/Bank out');
END;
$$;

-- =============================================================
-- BALANCE / TRIAL BALANCE VIEWS
-- =============================================================
CREATE OR REPLACE VIEW public.account_balances AS
SELECT
  a.id, a.code, a.account_name, a.account_type, a.sub_type, a.normal_balance, a.is_active,
  COALESCE(d.total, 0) AS debit_total,
  COALESCE(c.total, 0) AS credit_total,
  CASE WHEN a.normal_balance = 'debit'
       THEN COALESCE(d.total,0) - COALESCE(c.total,0)
       ELSE COALESCE(c.total,0) - COALESCE(d.total,0)
  END AS balance
FROM public.chart_of_accounts a
LEFT JOIN (SELECT debit_account_id AS aid, SUM(amount) AS total FROM public.journal_entry_lines WHERE debit_account_id IS NOT NULL GROUP BY debit_account_id) d ON d.aid = a.id
LEFT JOIN (SELECT credit_account_id AS aid, SUM(amount) AS total FROM public.journal_entry_lines WHERE credit_account_id IS NOT NULL GROUP BY credit_account_id) c ON c.aid = a.id;

GRANT SELECT ON public.account_balances TO anon, authenticated;