-- 065_message_attachments_storage_policies.sql
--
-- Phase 2.3 E4. The message-attachments bucket exists (mig 043) and
-- is public, but storage.objects has RLS enabled with no INSERT
-- policy for authenticated users — so client uploads via
-- supabase.storage.from('message-attachments').upload(...) fail with
-- "row-level security policy" errors. This migration adds the missing
-- policies so the existing upload code path works.
--
-- The path convention is `${user.id}/<file>`. RLS gates writes to
-- that user-owned prefix, so users can only upload into a folder
-- named after their own auth.uid().

DO $$ BEGIN
  CREATE POLICY "message_attachments_authenticated_upload"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'message-attachments'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "message_attachments_owner_delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'message-attachments'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The bucket is already marked public, but we still need a public
-- SELECT policy for the new RLS regime. Without this, getPublicUrl()
-- returns a URL that 404s for anonymous viewers (the recipient of the
-- message).
DO $$ BEGIN
  CREATE POLICY "message_attachments_public_read"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'message-attachments');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
