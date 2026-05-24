-- Loyalty start date and points expiry support

ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS loyalty_start_date date,
  ADD COLUMN IF NOT EXISTS points_validity_days integer;

-- Validate validity_days is positive when set
CREATE OR REPLACE FUNCTION public.validate_loyalty_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.points_validity_days IS NOT NULL AND NEW.points_validity_days < 1 THEN
    RAISE EXCEPTION 'points_validity_days must be >= 1';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_loyalty_settings ON public.loyalty_settings;
CREATE TRIGGER trg_validate_loyalty_settings
BEFORE INSERT OR UPDATE ON public.loyalty_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_loyalty_settings();

-- Per-transaction expiry & remaining (for FIFO consumption of earn rows)
ALTER TABLE public.loyalty_transactions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS remaining_points numeric NOT NULL DEFAULT 0;

-- Backfill: for existing earn rows, set remaining_points = points (no expiry — legacy preserved)
UPDATE public.loyalty_transactions
SET remaining_points = points
WHERE type = 'earn' AND remaining_points = 0 AND points > 0;

-- Allow 'expired' transaction type (informational rows)
-- (no enum constraint exists; type is plain text, so 'expired' just works)

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer_expires
  ON public.loyalty_transactions (customer_id, expires_at)
  WHERE type = 'earn';