-- Make regenerate_loan_schedule fully idempotent (already deletes, but be explicit)
-- and prevent the trigger from re-running on the self-update of installment_amount.

CREATE OR REPLACE FUNCTION public.trg_loan_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_system_entries('loan_disbursement', OLD.id);
    DELETE FROM public.journal_entries WHERE source_type = 'loan_payment'
      AND source_id IN (SELECT id FROM public.loan_payments WHERE loan_id = OLD.id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If only installment_amount changed (auto-computed by regenerate), skip to avoid recursion/dupes
    IF NEW.principal       IS NOT DISTINCT FROM OLD.principal
       AND NEW.annual_interest_rate IS NOT DISTINCT FROM OLD.annual_interest_rate
       AND NEW.start_date  IS NOT DISTINCT FROM OLD.start_date
       AND NEW.term_months IS NOT DISTINCT FROM OLD.term_months
       AND NEW.disbursement_account_code IS NOT DISTINCT FROM OLD.disbursement_account_code
       AND NEW.liability_account_code    IS NOT DISTINCT FROM OLD.liability_account_code
       AND NEW.is_deleted  IS NOT DISTINCT FROM OLD.is_deleted
       AND NEW.loan_name   IS NOT DISTINCT FROM OLD.loan_name
       AND NEW.bank_name   IS NOT DISTINCT FROM OLD.bank_name
    THEN
      RETURN NEW;
    END IF;
    PERFORM public.delete_system_entries('loan_disbursement', OLD.id);
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
