
CREATE OR REPLACE FUNCTION public.recalculate_asset_depreciation(_asset_id uuid, _up_to_month date DEFAULT NULL)
RETURNS TABLE(posted_count integer, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  res record;
BEGIN
  -- Wipe existing depreciation JEs and tracking rows for this asset
  DELETE FROM public.journal_entries
    WHERE source_type = 'fixed_asset_depreciation' AND source_id = _asset_id;
  DELETE FROM public.depreciation_entries WHERE asset_id = _asset_id;

  -- Re-post purchase JE (in case cost/date/funding changed)
  PERFORM public.post_fixed_asset_purchase_je(_asset_id);

  -- Re-run depreciation for this asset only by leveraging run_depreciation,
  -- then aggregate the row matching this asset.
  posted_count := 0;
  total_amount := 0;
  FOR res IN SELECT * FROM public.run_depreciation(_up_to_month) WHERE asset_id = _asset_id
  LOOP
    posted_count := res.posted_count;
    total_amount := res.total_amount;
  END LOOP;
  RETURN NEXT;
END;
$function$;
