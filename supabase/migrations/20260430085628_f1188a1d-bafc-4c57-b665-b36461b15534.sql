-- Extend loans for existing/opening balance loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS loan_type text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS original_principal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_disbursement_date date,
  ADD COLUMN IF NOT EXISTS next_payment_date date,
  ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT '';

ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_loan_type_check;
ALTER TABLE public.loans ADD CONSTRAINT loans_loan_type_check CHECK (loan_type IN ('new','existing'));

-- Allow loan_opening as a journal source type
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'manual','order','payment','expense','expense_payment','opening',
    'fixed_asset_purchase','fixed_asset_depreciation',
    'loan_disbursement','loan_opening','loan_payment'
  ]));

-- Update disbursement JE: branch by loan_type
CREATE OR REPLACE FUNCTION public.post_loan_disbursement_je(_loan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l public.loans;
  je_id uuid;
  bank_acc uuid;
  liab_acc uuid;
  equity_acc uuid;
  cutoff date;
  opening_date date;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND OR l.is_deleted OR l.principal <= 0 THEN RETURN NULL; END IF;

  -- clear both possible prior entries
  PERFORM public.delete_system_entries('loan_disbursement', l.id);
  PERFORM public.delete_system_entries('loan_opening', l.id);

  liab_acc := public.get_account_id(l.liability_account_code);
  IF liab_acc IS NULL THEN
    RAISE EXCEPTION 'Liability account % not found in Chart of Accounts', l.liability_account_code;
  END IF;

  IF l.loan_type = 'existing' THEN
    -- Opening liability: Dr Owner's Equity / Cr Bank Loan, dated cutoff-1
    equity_acc := public.get_account_id('3010');
    IF equity_acc IS NULL THEN
      RAISE EXCEPTION 'Equity account 3010 not found in Chart of Accounts';
    END IF;
    cutoff := public.get_accounting_start_date();
    opening_date := COALESCE(l.start_date, cutoff - INTERVAL '1 day')::date;

    INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
    VALUES (opening_date, 'loan_opening', l.id, 'Opening loan balance: ' || l.loan_name || ' (' || l.bank_name || ')', true)
    RETURNING id INTO je_id;

    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
    VALUES (je_id, equity_acc, l.principal, 'Opening equity offset');
    INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
    VALUES (je_id, liab_acc, l.principal, 'Outstanding loan at cutoff');
    RETURN je_id;
  END IF;

  -- New loan: Dr Bank / Cr Bank Loan
  bank_acc := public.get_account_id(l.disbursement_account_code);
  IF bank_acc IS NULL THEN
    RAISE EXCEPTION 'Disbursement account % not found in Chart of Accounts', l.disbursement_account_code;
  END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (l.start_date, 'loan_disbursement', l.id, 'Loan disbursement: ' || l.loan_name || ' (' || l.bank_name || ')', true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, bank_acc, l.principal, 'Loan proceeds received');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, liab_acc, l.principal, 'Bank loan liability');

  RETURN je_id;
END;
$function$;

-- Update trigger to also track loan_type changes & clear opening entries on delete
CREATE OR REPLACE FUNCTION public.trg_loan_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_system_entries('loan_disbursement', OLD.id);
    PERFORM public.delete_system_entries('loan_opening', OLD.id);
    DELETE FROM public.journal_entries WHERE source_type = 'loan_payment'
      AND source_id IN (SELECT id FROM public.loan_payments WHERE loan_id = OLD.id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.principal       IS NOT DISTINCT FROM OLD.principal
       AND NEW.annual_interest_rate IS NOT DISTINCT FROM OLD.annual_interest_rate
       AND NEW.start_date  IS NOT DISTINCT FROM OLD.start_date
       AND NEW.term_months IS NOT DISTINCT FROM OLD.term_months
       AND NEW.disbursement_account_code IS NOT DISTINCT FROM OLD.disbursement_account_code
       AND NEW.liability_account_code    IS NOT DISTINCT FROM OLD.liability_account_code
       AND NEW.is_deleted  IS NOT DISTINCT FROM OLD.is_deleted
       AND NEW.loan_name   IS NOT DISTINCT FROM OLD.loan_name
       AND NEW.bank_name   IS NOT DISTINCT FROM OLD.bank_name
       AND NEW.loan_type   IS NOT DISTINCT FROM OLD.loan_type
       AND NEW.next_payment_date IS NOT DISTINCT FROM OLD.next_payment_date
    THEN
      RETURN NEW;
    END IF;
    PERFORM public.delete_system_entries('loan_disbursement', OLD.id);
    PERFORM public.delete_system_entries('loan_opening', OLD.id);
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
$function$;

-- Update schedule generator: for existing loans, anchor to next_payment_date
CREATE OR REPLACE FUNCTION public.regenerate_loan_schedule(_loan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l public.loans;
  r numeric;
  pmt numeric;
  bal numeric;
  i int;
  interest_part numeric;
  principal_part numeric;
  due date;
  anchor date;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND OR l.is_deleted THEN RETURN; END IF;

  DELETE FROM public.loan_installments WHERE loan_id = _loan_id;

  IF l.principal <= 0 OR l.term_months <= 0 THEN RETURN; END IF;

  r := (l.annual_interest_rate / 100.0) / 12.0;
  IF COALESCE(l.installment_amount,0) <= 0 THEN
    pmt := public.calc_loan_installment(l.principal, l.annual_interest_rate, l.term_months);
    UPDATE public.loans SET installment_amount = pmt WHERE id = _loan_id;
  ELSE
    pmt := l.installment_amount;
  END IF;

  -- For existing loans, first installment is at next_payment_date (or start_date+1mo as fallback)
  -- For new loans, first installment is start_date + 1 month (existing behavior)
  IF l.loan_type = 'existing' AND l.next_payment_date IS NOT NULL THEN
    anchor := (l.next_payment_date - INTERVAL '1 month')::date;
  ELSE
    anchor := l.start_date;
  END IF;

  bal := l.principal;
  FOR i IN 1..l.term_months LOOP
    due := (anchor + (i || ' months')::interval)::date;
    interest_part := ROUND((bal * r)::numeric, 3);
    principal_part := ROUND((pmt - interest_part)::numeric, 3);
    IF i = l.term_months THEN
      principal_part := bal;
      pmt := principal_part + interest_part;
    END IF;
    bal := ROUND((bal - principal_part)::numeric, 3);
    IF bal < 0 THEN bal := 0; END IF;
    INSERT INTO public.loan_installments(loan_id, installment_no, due_date, principal_amount, interest_amount, total_amount, remaining_balance)
    VALUES (_loan_id, i, due, principal_part, interest_part, principal_part + interest_part, bal);
  END LOOP;
END;
$function$;