DROP VIEW IF EXISTS public.account_balances;
CREATE VIEW public.account_balances AS
SELECT
  a.id,
  a.code,
  a.account_name,
  a.account_type,
  a.sub_type,
  a.classification_type,
  a.normal_balance,
  a.is_system,
  a.is_active,
  a.description,
  COALESCE(d.total, 0::numeric) AS debit_total,
  COALESCE(c.total, 0::numeric) AS credit_total,
  CASE
    WHEN a.normal_balance = 'debit' THEN COALESCE(d.total,0) - COALESCE(c.total,0)
    ELSE COALESCE(c.total,0) - COALESCE(d.total,0)
  END AS balance
FROM public.chart_of_accounts a
LEFT JOIN (
  SELECT debit_account_id AS aid, SUM(amount) AS total
  FROM public.journal_entry_lines WHERE debit_account_id IS NOT NULL
  GROUP BY debit_account_id
) d ON d.aid = a.id
LEFT JOIN (
  SELECT credit_account_id AS aid, SUM(amount) AS total
  FROM public.journal_entry_lines WHERE credit_account_id IS NOT NULL
  GROUP BY credit_account_id
) c ON c.aid = a.id;

GRANT SELECT ON public.account_balances TO anon, authenticated;