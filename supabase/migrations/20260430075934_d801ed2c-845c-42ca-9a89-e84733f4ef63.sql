
-- ============= LOANS =============
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_name text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  principal numeric NOT NULL DEFAULT 0,
  annual_interest_rate numeric NOT NULL DEFAULT 0, -- percent, e.g. 5.5
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  term_months integer NOT NULL DEFAULT 12,
  installment_amount numeric NOT NULL DEFAULT 0, -- computed if zero
  payment_frequency text NOT NULL DEFAULT 'monthly',
  disbursement_account_code text NOT NULL DEFAULT '1020', -- Bank
  liability_account_code text NOT NULL DEFAULT '2110',    -- Bank Loan
  interest_expense_code text NOT NULL DEFAULT '5090',     -- Loan/Interest Expense
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active', -- active | closed
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read loans" ON public.loans FOR SELECT USING (true);
CREATE POLICY "Admins can insert loans" ON public.loans FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update loans" ON public.loans FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete loans" ON public.loans FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= INSTALLMENTS (amortization schedule) =============
CREATE TABLE public.loan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  principal_amount numeric NOT NULL DEFAULT 0,
  interest_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  remaining_balance numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT false,
  paid_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_no)
);

ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read installments" ON public.loan_installments FOR SELECT USING (true);
CREATE POLICY "Admins manage installments" ON public.loan_installments FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_loan_installments_loan ON public.loan_installments(loan_id, installment_no);

-- ============= LOAN PAYMENTS =============
CREATE TABLE public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.loan_installments(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  principal_portion numeric NOT NULL DEFAULT 0,
  interest_portion numeric NOT NULL DEFAULT 0,
  payment_source text NOT NULL DEFAULT 'bank', -- cash | bank
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read loan_payments" ON public.loan_payments FOR SELECT USING (true);
CREATE POLICY "Admins manage loan_payments" ON public.loan_payments FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_loan_payments_loan ON public.loan_payments(loan_id);

-- ============= AMORTIZATION HELPERS =============
CREATE OR REPLACE FUNCTION public.calc_loan_installment(_principal numeric, _annual_rate numeric, _months integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  r numeric;
  pmt numeric;
BEGIN
  IF _months <= 0 OR _principal <= 0 THEN RETURN 0; END IF;
  r := (_annual_rate / 100.0) / 12.0;
  IF r = 0 THEN
    RETURN ROUND((_principal / _months)::numeric, 3);
  END IF;
  pmt := _principal * r / (1 - power(1 + r, -_months));
  RETURN ROUND(pmt::numeric, 3);
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_loan_schedule(_loan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.loans;
  r numeric;
  pmt numeric;
  bal numeric;
  i int;
  interest_part numeric;
  principal_part numeric;
  due date;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND OR l.is_deleted THEN RETURN; END IF;

  -- Wipe old schedule (only if no payments yet for safety)
  DELETE FROM public.loan_installments WHERE loan_id = _loan_id;

  IF l.principal <= 0 OR l.term_months <= 0 THEN RETURN; END IF;

  r := (l.annual_interest_rate / 100.0) / 12.0;
  IF COALESCE(l.installment_amount,0) <= 0 THEN
    pmt := public.calc_loan_installment(l.principal, l.annual_interest_rate, l.term_months);
    UPDATE public.loans SET installment_amount = pmt WHERE id = _loan_id;
  ELSE
    pmt := l.installment_amount;
  END IF;

  bal := l.principal;
  FOR i IN 1..l.term_months LOOP
    due := (l.start_date + (i || ' months')::interval)::date;
    interest_part := ROUND((bal * r)::numeric, 3);
    principal_part := ROUND((pmt - interest_part)::numeric, 3);
    IF i = l.term_months THEN
      principal_part := bal; -- final adjust
      pmt := principal_part + interest_part;
    END IF;
    bal := ROUND((bal - principal_part)::numeric, 3);
    IF bal < 0 THEN bal := 0; END IF;
    INSERT INTO public.loan_installments(loan_id, installment_no, due_date, principal_amount, interest_amount, total_amount, remaining_balance)
    VALUES (_loan_id, i, due, principal_part, interest_part, principal_part + interest_part, bal);
  END LOOP;
END;
$$;

-- ============= JE: DISBURSEMENT =============
CREATE OR REPLACE FUNCTION public.post_loan_disbursement_je(_loan_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.loans;
  je_id uuid;
  bank_acc uuid;
  liab_acc uuid;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND OR l.is_deleted OR l.principal <= 0 THEN RETURN NULL; END IF;

  PERFORM public.delete_system_entries('loan_disbursement', l.id);

  bank_acc := public.get_account_id(l.disbursement_account_code);
  liab_acc := public.get_account_id(l.liability_account_code);
  IF bank_acc IS NULL OR liab_acc IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (l.start_date, 'loan_disbursement', l.id, 'Loan disbursement: ' || l.loan_name || ' (' || l.bank_name || ')', true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, bank_acc, l.principal, 'Loan proceeds received');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, liab_acc, l.principal, 'Bank loan liability');

  RETURN je_id;
END;
$$;

-- ============= JE: PAYMENT =============
CREATE OR REPLACE FUNCTION public.post_loan_payment_je(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.loan_payments;
  l public.loans;
  je_id uuid;
  cash_acc uuid;
  liab_acc uuid;
  int_acc uuid;
BEGIN
  SELECT * INTO p FROM public.loan_payments WHERE id = _payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.loans WHERE id = p.loan_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM public.delete_system_entries('loan_payment', p.id);
  IF p.amount <= 0 THEN RETURN NULL; END IF;

  cash_acc := public.get_account_id(public.payment_method_to_account_code(p.payment_source));
  liab_acc := public.get_account_id(l.liability_account_code);
  int_acc  := public.get_account_id(l.interest_expense_code);
  IF cash_acc IS NULL OR liab_acc IS NULL OR int_acc IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (p.payment_date, 'loan_payment', p.id, 'Loan payment: ' || l.loan_name, true)
  RETURNING id INTO je_id;

  IF p.interest_portion > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
    VALUES (je_id, int_acc, p.interest_portion, 'Interest expense');
  END IF;
  IF p.principal_portion > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
    VALUES (je_id, liab_acc, p.principal_portion, 'Principal repayment');
  END IF;
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, cash_acc, p.amount, 'Paid from ' || p.payment_source);

  RETURN je_id;
END;
$$;

-- ============= TRIGGERS =============
CREATE OR REPLACE FUNCTION public.trg_loan_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('loan_disbursement', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.journal_entries WHERE source_type = 'loan_payment'
      AND source_id IN (SELECT id FROM public.loan_payments WHERE loan_id = OLD.id);
    RETURN OLD;
  END IF;

  IF NEW.is_deleted THEN
    DELETE FROM public.journal_entries WHERE source_type = 'loan_payment'
      AND source_id IN (SELECT id FROM public.loan_payments WHERE loan_id = NEW.id);
    RETURN NEW;
  END IF;

  PERFORM public.regenerate_loan_schedule(NEW.id);
  PERFORM public.post_loan_disbursement_je(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_loans_changed
AFTER INSERT OR UPDATE OR DELETE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_changed();

CREATE OR REPLACE FUNCTION public.trg_loan_payment_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_paid numeric;
  inst_total numeric;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.delete_system_entries('loan_payment', OLD.id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.installment_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.loan_payments WHERE installment_id = OLD.installment_id;
      SELECT total_amount INTO inst_total FROM public.loan_installments WHERE id = OLD.installment_id;
      UPDATE public.loan_installments
        SET paid_amount = total_paid,
            is_paid = (total_paid + 0.001 >= COALESCE(inst_total,0))
        WHERE id = OLD.installment_id;
    END IF;
    RETURN OLD;
  END IF;

  PERFORM public.post_loan_payment_je(NEW.id);

  IF NEW.installment_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.loan_payments WHERE installment_id = NEW.installment_id;
    SELECT total_amount INTO inst_total FROM public.loan_installments WHERE id = NEW.installment_id;
    UPDATE public.loan_installments
      SET paid_amount = total_paid,
          is_paid = (total_paid + 0.001 >= COALESCE(inst_total,0))
      WHERE id = NEW.installment_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_loan_payments_changed
AFTER INSERT OR UPDATE OR DELETE ON public.loan_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_payment_changed();

-- ============= REBUILD INTEGRATION =============
-- Update rebuild to preserve loan-related JEs (they're managed by the loans module)
CREATE OR REPLACE FUNCTION public.rebuild_accounting_from_cutoff()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff date := public.get_accounting_start_date();
  r record;
BEGIN
  DELETE FROM public.journal_entries
    WHERE is_system = true
    AND source_type NOT IN ('opening','fixed_asset_purchase','fixed_asset_depreciation','loan_disbursement','loan_payment');

  FOR r IN SELECT * FROM public.orders
           WHERE NOT is_draft AND NOT is_deleted AND order_date >= cutoff AND COALESCE(total_amount,0) > 0
  LOOP PERFORM public.post_order_replay(r.id); END LOOP;

  FOR r IN SELECT * FROM public.payments WHERE (payment_date AT TIME ZONE 'Asia/Muscat')::date >= cutoff AND amount > 0
  LOOP PERFORM public.post_payment_replay(r.id); END LOOP;

  FOR r IN SELECT * FROM public.expenses
           WHERE expense_date >= cutoff AND amount > 0
             AND NOT (is_recurring AND NOT is_auto_generated)
  LOOP PERFORM public.post_expense_replay(r.id); END LOOP;

  FOR r IN SELECT * FROM public.expense_payments WHERE payment_date >= cutoff AND amount > 0
  LOOP PERFORM public.post_expense_payment_replay(r.id); END LOOP;
END;
$$;

-- ============= CURRENT vs NON-CURRENT helper =============
CREATE OR REPLACE FUNCTION public.get_loan_split_summary()
RETURNS TABLE(total_outstanding numeric, current_portion numeric, non_current_portion numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH unpaid AS (
    SELECT li.principal_amount, li.due_date
    FROM public.loan_installments li
    JOIN public.loans l ON l.id = li.loan_id
    WHERE NOT l.is_deleted AND NOT li.is_paid
  )
  SELECT
    COALESCE(SUM(principal_amount),0) AS total_outstanding,
    COALESCE(SUM(CASE WHEN due_date <= (CURRENT_DATE + INTERVAL '12 months')::date THEN principal_amount ELSE 0 END),0) AS current_portion,
    COALESCE(SUM(CASE WHEN due_date >  (CURRENT_DATE + INTERVAL '12 months')::date THEN principal_amount ELSE 0 END),0) AS non_current_portion
  FROM unpaid;
$$;
