
-- Update rebuild to preserve opening entries
CREATE OR REPLACE FUNCTION public.rebuild_accounting_from_cutoff()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff date := public.get_accounting_start_date();
  r record;
BEGIN
  -- Wipe system-generated entries EXCEPT opening balances
  DELETE FROM public.journal_entries WHERE is_system = true AND source_type <> 'opening';

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
$function$;

-- Function to post opening balances. Payload: { "lines": [{ "account_id": uuid, "amount": number }, ...], "equity_account_id": uuid }
-- Each line amount is the opening balance in the account's natural direction (positive = the natural side of that account).
-- Equity account receives the balancing amount.
CREATE OR REPLACE FUNCTION public.post_opening_balances(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff date := public.get_accounting_start_date();
  opening_date date := cutoff - INTERVAL '1 day';
  je_id uuid;
  ln jsonb;
  acc record;
  total_debit numeric := 0;
  total_credit numeric := 0;
  equity_acc_id uuid;
  equity_amount numeric;
  amt numeric;
BEGIN
  -- Remove any prior opening entry
  DELETE FROM public.journal_entries WHERE source_type = 'opening' AND is_system = true;

  equity_acc_id := (_payload->>'equity_account_id')::uuid;
  IF equity_acc_id IS NULL THEN
    equity_acc_id := public.get_account_id('3010');
  END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (opening_date, 'opening', NULL, 'Opening Balances as of ' || opening_date, true)
  RETURNING id INTO je_id;

  -- Iterate over lines
  FOR ln IN SELECT * FROM jsonb_array_elements(_payload->'lines')
  LOOP
    amt := COALESCE((ln->>'amount')::numeric, 0);
    IF amt = 0 THEN CONTINUE; END IF;
    SELECT id, normal_balance, account_name INTO acc
    FROM public.chart_of_accounts WHERE id = (ln->>'account_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF acc.id = equity_acc_id THEN CONTINUE; END IF; -- skip; equity is computed

    IF acc.normal_balance = 'debit' THEN
      INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
      VALUES (je_id, acc.id, amt, 'Opening: ' || acc.account_name);
      total_debit := total_debit + amt;
    ELSE
      INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
      VALUES (je_id, acc.id, amt, 'Opening: ' || acc.account_name);
      total_credit := total_credit + amt;
    END IF;
  END LOOP;

  -- Balancing entry to equity account
  equity_amount := total_debit - total_credit;
  IF equity_amount > 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
    VALUES (je_id, equity_acc_id, equity_amount, 'Opening: Owner''s Equity (balancing)');
  ELSIF equity_amount < 0 THEN
    INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
    VALUES (je_id, equity_acc_id, -equity_amount, 'Opening: Owner''s Equity (balancing)');
  END IF;

  -- If no lines were posted at all, remove the empty entry
  IF total_debit = 0 AND total_credit = 0 THEN
    DELETE FROM public.journal_entries WHERE id = je_id;
    RETURN NULL;
  END IF;

  RETURN je_id;
END;
$function$;

-- Helper to fetch the current opening balance entry's lines (for editing)
CREATE OR REPLACE FUNCTION public.get_opening_balances()
 RETURNS TABLE(account_id uuid, amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(l.debit_account_id, l.credit_account_id) AS account_id,
    SUM(l.amount) AS amount
  FROM public.journal_entries je
  JOIN public.journal_entry_lines l ON l.entry_id = je.id
  WHERE je.source_type = 'opening' AND je.is_system = true
  GROUP BY 1
$function$;
