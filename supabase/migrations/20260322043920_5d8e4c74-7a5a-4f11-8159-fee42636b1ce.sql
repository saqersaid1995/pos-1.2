
-- Add new columns to items table
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_name_ar text DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url text DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS show_in_quick_add boolean NOT NULL DEFAULT true;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to item images
CREATE POLICY "Public read item images" ON storage.objects FOR SELECT USING (bucket_id = 'item-images');

-- Allow anon and authenticated to upload/update/delete item images
CREATE POLICY "Anon can upload item images" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'item-images');
CREATE POLICY "Anon can update item images" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'item-images');
CREATE POLICY "Anon can delete item images" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'item-images');
CREATE POLICY "Auth can upload item images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'item-images');
CREATE POLICY "Auth can update item images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'item-images');
CREATE POLICY "Auth can delete item images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'item-images');
