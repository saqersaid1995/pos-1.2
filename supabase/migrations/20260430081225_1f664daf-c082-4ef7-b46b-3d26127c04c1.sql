INSERT INTO public.chart_of_accounts (code, account_name, account_type, normal_balance, classification_type, sub_type, description, is_system, is_active)
VALUES ('2110', 'Bank Loan', 'Liability', 'credit', 'non_current_liability', 'Long-term Debt', 'Long-term bank loan liability (loans module)', true, true)
ON CONFLICT (code) DO UPDATE SET is_active = true;

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
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND OR l.is_deleted OR l.principal <= 0 THEN RETURN NULL; END IF;

  PERFORM public.delete_system_entries('loan_disbursement', l.id);

  bank_acc := public.get_account_id(l.disbursement_account_code);
  liab_acc := public.get_account_id(l.liability_account_code);
  IF bank_acc IS NULL THEN
    RAISE EXCEPTION 'Disbursement account % not found in Chart of Accounts', l.disbursement_account_code;
  END IF;
  IF liab_acc IS NULL THEN
    RAISE EXCEPTION 'Liability account % not found in Chart of Accounts', l.liability_account_code;
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
