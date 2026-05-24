-- Add is_read column for tracking read/unread conversations
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Create storage bucket for whatsapp media
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to whatsapp-media bucket
CREATE POLICY "Public read access for whatsapp-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Allow service role inserts (edge functions use service role)
CREATE POLICY "Service role insert for whatsapp-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');
