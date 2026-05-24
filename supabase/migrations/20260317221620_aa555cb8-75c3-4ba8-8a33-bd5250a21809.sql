
CREATE TABLE public.service_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type TEXT NOT NULL,
  service_type TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'OMR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (item_type, service_type)
);

ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read service_pricing" ON public.service_pricing FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert service_pricing" ON public.service_pricing FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update service_pricing" ON public.service_pricing FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete service_pricing" ON public.service_pricing FOR DELETE TO anon USING (true);
CREATE POLICY "Authenticated can read service_pricing" ON public.service_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert service_pricing" ON public.service_pricing FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update service_pricing" ON public.service_pricing FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete service_pricing" ON public.service_pricing FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_service_pricing_updated_at
  BEFORE UPDATE ON public.service_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
