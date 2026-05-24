-- Create items table
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read items" ON public.items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert items" ON public.items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update items" ON public.items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete items" ON public.items FOR DELETE TO anon USING (true);
CREATE POLICY "Authenticated can read items" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert items" ON public.items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update items" ON public.items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete items" ON public.items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create services table
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read services" ON public.services FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert services" ON public.services FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update services" ON public.services FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete services" ON public.services FOR DELETE TO anon USING (true);
CREATE POLICY "Authenticated can read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update services" ON public.services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete services" ON public.services FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default items
INSERT INTO public.items (item_name) VALUES
  ('Thobe'), ('Shirt'), ('Pants'), ('Jacket'), ('Suit'), ('Dress'), ('Skirt'),
  ('Coat'), ('Blanket'), ('Carpet'), ('Curtain'), ('Abaya'), ('Scarf'), ('Tie'),
  ('Jeans'), ('T-Shirt'), ('Sweater'), ('Kumma'), ('Ghutra'), ('Pillow'),
  ('Bedsheet'), ('Kids Thobe'), ('Small Blanket'), ('Large Blanket');

-- Seed default services
INSERT INTO public.services (service_name) VALUES
  ('Wash Only'), ('Iron Only'), ('Wash + Iron'), ('Dry Clean'),
  ('Special Cleaning'), ('Carpet Cleaning'), ('Blanket Cleaning');

-- Add item_id and service_id columns to service_pricing
ALTER TABLE public.service_pricing
  ADD COLUMN item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  ADD COLUMN service_id uuid REFERENCES public.services(id) ON DELETE CASCADE;

-- Migrate existing data: match text names to new IDs
UPDATE public.service_pricing sp
SET item_id = i.id
FROM public.items i
WHERE sp.item_type = i.item_name;

UPDATE public.service_pricing sp
SET service_id = s.id
FROM public.services s
WHERE sp.service_type = s.service_name;

-- Add unique constraint on item_id + service_id
CREATE UNIQUE INDEX service_pricing_item_service_unique ON public.service_pricing (item_id, service_id) WHERE item_id IS NOT NULL AND service_id IS NOT NULL;