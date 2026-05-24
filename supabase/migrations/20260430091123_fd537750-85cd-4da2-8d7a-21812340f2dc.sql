-- Backfill helper: re-post purchase JE for any active asset missing one.
CREATE OR REPLACE FUNCTION public.backfill_missing_asset_purchase_jes()
RETURNS TABLE(asset_id uuid, asset_name text, posted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record;
  je uuid;
BEGIN
  FOR a IN
    SELECT fa.id, fa.asset_name
    FROM public.fixed_assets fa
    WHERE NOT fa.is_deleted
      AND fa.cost > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.source_type = 'fixed_asset_purchase' AND je.source_id = fa.id
      )
  LOOP
    je := public.post_fixed_asset_purchase_je(a.id);
    asset_id := a.id;
    asset_name := a.asset_name;
    posted := je IS NOT NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Run the backfill once now to repair existing orphans.
SELECT * FROM public.backfill_missing_asset_purchase_jes();