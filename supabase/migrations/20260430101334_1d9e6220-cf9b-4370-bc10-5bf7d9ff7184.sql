-- ============================================================
-- 1. Enforce double-entry rule at the DB level
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_journal_entry_balanced(_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d numeric;
  c numeric;
  bad_lines int;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN debit_account_id  IS NOT NULL THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN credit_account_id IS NOT NULL THEN amount ELSE 0 END), 0),
    COUNT(*) FILTER (
      WHERE (debit_account_id IS NULL AND credit_account_id IS NULL)
         OR (debit_account_id IS NOT NULL AND credit_account_id IS NOT NULL)
         OR amount <= 0
    )
  INTO d, c, bad_lines
  FROM public.journal_entry_lines
  WHERE entry_id = _entry_id;

  IF bad_lines > 0 THEN
    RAISE EXCEPTION 'Journal entry % has invalid lines (missing/both/zero amounts).', _entry_id;
  END IF;

  IF ROUND(d::numeric, 3) <> ROUND(c::numeric, 3) THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced. Debit=% Credit=% Diff=%',
      _entry_id, d, c, ROUND((d - c)::numeric, 3);
  END IF;
END;
$$;

-- Constraint trigger fires AT END of statement, allowing multi-line inserts to balance
CREATE OR REPLACE FUNCTION public.trg_check_je_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  eid uuid;
BEGIN
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  -- If the parent entry was deleted in this statement, skip
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = eid) THEN
    RETURN NULL;
  END IF;
  PERFORM public.assert_journal_entry_balanced(eid);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS check_je_balance ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER check_je_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.trg_check_je_balance();

-- ============================================================
-- 2. Rebuild summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.rebuild_accounting_with_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  before_count int;
  after_count int;
  unbalanced_count int;
BEGIN
  SELECT COUNT(*) INTO before_count FROM public.journal_entries;
  PERFORM public.rebuild_accounting_from_cutoff();
  SELECT COUNT(*) INTO after_count FROM public.journal_entries;

  WITH t AS (
    SELECT entry_id,
      SUM(CASE WHEN debit_account_id  IS NOT NULL THEN amount ELSE 0 END) AS d,
      SUM(CASE WHEN credit_account_id IS NOT NULL THEN amount ELSE 0 END) AS c
    FROM public.journal_entry_lines GROUP BY entry_id
  )
  SELECT COUNT(*) INTO unbalanced_count FROM t WHERE ROUND((d-c)::numeric,3) <> 0;

  RETURN jsonb_build_object(
    'entries_before', before_count,
    'entries_after',  after_count,
    'unbalanced',     unbalanced_count
  );
END;
$$;

-- ============================================================
-- 3. Loan-entry audit (lists every JE touching loan accounts)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_loan_journal_entries()
RETURNS TABLE(
  loan_id uuid, loan_name text, source_type text,
  entry_id uuid, entry_date date, description text,
  debit_amount numeric, credit_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.loan_name, je.source_type, je.id, je.entry_date, je.description,
    COALESCE((SELECT SUM(amount) FROM public.journal_entry_lines
              WHERE entry_id = je.id AND debit_account_id IS NOT NULL), 0),
    COALESCE((SELECT SUM(amount) FROM public.journal_entry_lines
              WHERE entry_id = je.id AND credit_account_id IS NOT NULL), 0)
  FROM public.journal_entries je
  LEFT JOIN public.loans l ON l.id = je.source_id
  WHERE je.source_type IN ('loan_disbursement','loan_opening','loan_payment')
  ORDER BY je.entry_date DESC, je.created_at DESC;
$$;

-- ============================================================
-- 4. Detect loans with BOTH disbursement AND opening entries (must be only one)
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_duplicate_loan_postings()
RETURNS TABLE(loan_id uuid, loan_name text, has_disbursement boolean, has_opening boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.loan_name,
    EXISTS(SELECT 1 FROM public.journal_entries WHERE source_type='loan_disbursement' AND source_id=l.id),
    EXISTS(SELECT 1 FROM public.journal_entries WHERE source_type='loan_opening'      AND source_id=l.id)
  FROM public.loans l
  WHERE l.is_deleted = false
    AND EXISTS(SELECT 1 FROM public.journal_entries WHERE source_type='loan_disbursement' AND source_id=l.id)
    AND EXISTS(SELECT 1 FROM public.journal_entries WHERE source_type='loan_opening'      AND source_id=l.id);
$$;