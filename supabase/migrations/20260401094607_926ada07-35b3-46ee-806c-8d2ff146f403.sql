
-- Add new columns for recurring expense automation
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS billing_day integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_run_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_run_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS expense_status text NOT NULL DEFAULT 'paid',
ADD COLUMN IF NOT EXISTS is_auto_generated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_recurring_id uuid DEFAULT NULL;

-- Add constraint for billing_day range
CREATE OR REPLACE FUNCTION public.validate_billing_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.billing_day IS NOT NULL AND (NEW.billing_day < 1 OR NEW.billing_day > 31) THEN
    RAISE EXCEPTION 'billing_day must be between 1 and 31';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_billing_day_trigger
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.validate_billing_day();
