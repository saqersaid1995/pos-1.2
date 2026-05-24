-- Clean up duplicate messages, keeping only the oldest per wa_message_id
DELETE FROM whatsapp_messages
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY wa_message_id ORDER BY created_at ASC) as rn
    FROM whatsapp_messages
    WHERE wa_message_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Add unique index on wa_message_id to prevent future duplicates at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_message_id_unique
ON whatsapp_messages (wa_message_id)
WHERE wa_message_id IS NOT NULL;