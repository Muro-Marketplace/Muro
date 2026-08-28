-- 043_message_attachments.sql
-- F2 — message file attachments.
-- attachments JSONB shape: [{ url, filename, mimeType, sizeBytes, thumbnailUrl?, width?, height? }]

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
