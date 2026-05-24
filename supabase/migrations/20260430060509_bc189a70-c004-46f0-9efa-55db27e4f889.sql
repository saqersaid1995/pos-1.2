-- Recreate view without security_definer (use security_invoker)
DROP VIEW IF EXISTS public.account_balances;
CREATE VIEW public.account_balances
WITH (security_invoker = true) AS
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

-- Ensure search_path on the IMMUTABLE helper (no SECURITY DEFINER but linter still flags)
ALTER FUNCTION public.expense_category_to_account_code(text) SET search_path = public;
ALTER FUNCTION public.payment_method_to_account_code(text) SET search_path = public;