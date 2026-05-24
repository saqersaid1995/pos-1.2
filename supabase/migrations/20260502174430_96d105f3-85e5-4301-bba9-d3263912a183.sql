
CREATE OR REPLACE FUNCTION public.get_monthly_cash_movements(_account_codes text[] DEFAULT ARRAY['1010','1020']::text[])
RETURNS TABLE(
  month_start date,
  inflows numeric,
  outflows numeric,
  cash_inflows numeric,
  cash_outflows numeric,
  bank_inflows numeric,
  bank_outflows numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH lines AS (
    SELECT
      date_trunc('month', je.entry_date)::date AS m,
      coa_d.code AS d_code,
      coa_c.code AS c_code,
      l.amount
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.entry_id
    LEFT JOIN public.chart_of_accounts coa_d ON coa_d.id = l.debit_account_id
    LEFT JOIN public.chart_of_accounts coa_c ON coa_c.id = l.credit_account_id
    WHERE (coa_d.code = ANY(_account_codes) OR coa_c.code = ANY(_account_codes))
  )
  SELECT
    m,
    COALESCE(SUM(CASE WHEN d_code = ANY(_account_codes) THEN amount ELSE 0 END), 0) AS inflows,
    COALESCE(SUM(CASE WHEN c_code = ANY(_account_codes) THEN amount ELSE 0 END), 0) AS outflows,
    COALESCE(SUM(CASE WHEN d_code = '1010' THEN amount ELSE 0 END), 0) AS cash_inflows,
    COALESCE(SUM(CASE WHEN c_code = '1010' THEN amount ELSE 0 END), 0) AS cash_outflows,
    COALESCE(SUM(CASE WHEN d_code = '1020' THEN amount ELSE 0 END), 0) AS bank_inflows,
    COALESCE(SUM(CASE WHEN c_code = '1020' THEN amount ELSE 0 END), 0) AS bank_outflows
  FROM lines
  GROUP BY m
  ORDER BY m;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_cash_breakdown(_month_start date, _account_codes text[] DEFAULT ARRAY['1010','1020']::text[])
RETURNS TABLE(
  entry_id uuid,
  entry_date date,
  source_type text,
  description text,
  line_description text,
  debit numeric,
  credit numeric,
  account_code text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    je.id,
    je.entry_date,
    je.source_type,
    je.description,
    l.line_description,
    CASE WHEN coa_d.code = ANY(_account_codes) THEN l.amount ELSE 0 END AS debit,
    CASE WHEN coa_c.code = ANY(_account_codes) THEN l.amount ELSE 0 END AS credit,
    COALESCE(
      CASE WHEN coa_d.code = ANY(_account_codes) THEN coa_d.code END,
      CASE WHEN coa_c.code = ANY(_account_codes) THEN coa_c.code END
    ) AS account_code
  FROM public.journal_entry_lines l
  JOIN public.journal_entries je ON je.id = l.entry_id
  LEFT JOIN public.chart_of_accounts coa_d ON coa_d.id = l.debit_account_id
  LEFT JOIN public.chart_of_accounts coa_c ON coa_c.id = l.credit_account_id
  WHERE date_trunc('month', je.entry_date)::date = date_trunc('month', _month_start)::date
    AND (coa_d.code = ANY(_account_codes) OR coa_c.code = ANY(_account_codes))
  ORDER BY je.entry_date, je.created_at;
$$;
