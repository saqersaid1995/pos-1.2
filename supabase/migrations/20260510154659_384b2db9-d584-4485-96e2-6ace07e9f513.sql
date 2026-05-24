
-- Country codes table
CREATE TABLE public.whatsapp_country_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name text NOT NULL,
  country_code text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_country_codes_only_one_default
  ON public.whatsapp_country_codes ((is_default)) WHERE is_default = true;

ALTER TABLE public.whatsapp_country_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read whatsapp_country_codes"
  ON public.whatsapp_country_codes FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins insert whatsapp_country_codes"
  ON public.whatsapp_country_codes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update whatsapp_country_codes"
  ON public.whatsapp_country_codes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete whatsapp_country_codes"
  ON public.whatsapp_country_codes FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.whatsapp_country_codes (country_name, country_code, is_default, sort_order) VALUES
  ('Oman', '+968', true, 1),
  ('United Arab Emirates', '+971', false, 2),
  ('Saudi Arabia', '+966', false, 3),
  ('Qatar', '+974', false, 4),
  ('Bahrain', '+973', false, 5),
  ('Kuwait', '+965', false, 6);

-- Customer phone parts
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT '+968',
  ADD COLUMN IF NOT EXISTS local_phone text,
  ADD COLUMN IF NOT EXISTS full_phone_e164 text;

-- Backfill: assume default +968 for legacy rows
UPDATE public.customers
SET
  country_code = COALESCE(country_code, '+968'),
  local_phone = CASE
    WHEN phone_number LIKE '+968%' THEN substring(phone_number from 5)
    WHEN phone_number LIKE '968%' AND length(phone_number) > 8 THEN substring(phone_number from 4)
    WHEN phone_number LIKE '+%' THEN regexp_replace(phone_number, '^\+\d{1,3}', '')
    ELSE regexp_replace(phone_number, '\D', '', 'g')
  END,
  full_phone_e164 = CASE
    WHEN phone_number LIKE '+%' THEN regexp_replace(phone_number, '\s', '', 'g')
    WHEN phone_number LIKE '968%' AND length(phone_number) > 8 THEN '+' || regexp_replace(phone_number, '\D', '', 'g')
    ELSE '+968' || regexp_replace(phone_number, '\D', '', 'g')
  END
WHERE full_phone_e164 IS NULL;

CREATE INDEX IF NOT EXISTS customers_full_phone_e164_idx ON public.customers (full_phone_e164);
CREATE INDEX IF NOT EXISTS customers_local_phone_idx ON public.customers (local_phone);

-- Updated_at trigger
CREATE TRIGGER update_whatsapp_country_codes_updated_at
  BEFORE UPDATE ON public.whatsapp_country_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
