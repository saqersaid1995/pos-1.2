ALTER TABLE public.orders ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN deleted_at timestamptz DEFAULT NULL;