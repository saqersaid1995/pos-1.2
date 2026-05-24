
-- Audit log for payment method/amount/date corrections
CREATE TABLE IF NOT EXISTS public.payment_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  original_payment_id uuid,
  old_method text,
  new_method text,
  old_amount numeric,
  new_amount numeric,
  old_payment_date timestamptz,
  new_payment_date timestamptz,
  reason text DEFAULT '',
  changed_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read payment_corrections"
  ON public.payment_corrections FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert payment_corrections"
  ON public.payment_corrections FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_payment_corrections_order ON public.payment_corrections(order_id);

-- RPC: correct a payment. Supports method/amount/date change and mixed split.
-- For mixed: deletes the original payment and inserts one row per non-zero split.
-- Existing payment trigger will reverse the old JE and post new JEs automatically.
CREATE OR REPLACE FUNCTION public.correct_payment(
  _payment_id uuid,
  _payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.payments;
  splits jsonb;
  s jsonb;
  total_split numeric := 0;
  new_method text;
  new_amount numeric;
  new_date timestamptz;
  reason text;
  changed_by text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', _payment_id;
  END IF;

  new_method := COALESCE(_payload->>'method', p.payment_method);
  new_amount := COALESCE((_payload->>'amount')::numeric, p.amount);
  new_date   := COALESCE((_payload->>'payment_date')::timestamptz, p.payment_date);
  reason     := COALESCE(_payload->>'reason', '');
  changed_by := COALESCE(_payload->>'changed_by', '');
  splits     := _payload->'splits';

  -- Audit row
  INSERT INTO public.payment_corrections(
    order_id, original_payment_id, old_method, new_method,
    old_amount, new_amount, old_payment_date, new_payment_date,
    reason, changed_by
  ) VALUES (
    p.order_id, p.id, p.payment_method, new_method,
    p.amount, new_amount, p.payment_date, new_date,
    reason, changed_by
  );

  IF splits IS NOT NULL AND jsonb_array_length(splits) > 0 THEN
    -- Validate splits sum
    FOR s IN SELECT * FROM jsonb_array_elements(splits) LOOP
      total_split := total_split + COALESCE((s->>'amount')::numeric, 0);
    END LOOP;
    IF ROUND(total_split::numeric, 3) <> ROUND(new_amount::numeric, 3) THEN
      RAISE EXCEPTION 'Split total (%) must equal payment amount (%)', total_split, new_amount;
    END IF;

    -- Remove original (trigger reverses original JE)
    DELETE FROM public.payments WHERE id = p.id;

    -- Insert one payment row per non-zero split (triggers post new JEs)
    FOR s IN SELECT * FROM jsonb_array_elements(splits) LOOP
      IF COALESCE((s->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.payments(order_id, payment_method, amount, payment_date, notes)
        VALUES (
          p.order_id,
          s->>'method',
          (s->>'amount')::numeric,
          new_date,
          CASE WHEN reason <> '' THEN 'Correction: ' || reason ELSE 'Correction (mixed split)' END
        );
      END IF;
    END LOOP;
  ELSE
    -- Simple update (trigger reverses old, posts new)
    UPDATE public.payments
       SET payment_method = new_method,
           amount = new_amount,
           payment_date = new_date,
           notes = CASE WHEN reason <> '' THEN 'Correction: ' || reason ELSE COALESCE(notes,'') END
     WHERE id = p.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', p.order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_payment(uuid, jsonb) TO authenticated, anon;
