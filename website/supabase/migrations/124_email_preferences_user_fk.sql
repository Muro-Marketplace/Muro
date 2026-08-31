-- C27 (wave 4). email_preferences.user_id is the primary key and has never
-- referenced auth.users, so POST /api/account/email/unsubscribe (deliberately
-- unauthenticated, because unsubscribe links are followed from an inbox) could
-- upsert a row for any UUID a caller invented. The route now validates the
-- UUID, checks the account exists and is rate limited, but that is an
-- application guard: nothing stopped a future writer, and a deleted user's
-- preferences outlived them.
--
-- The sibling tables written by the same kind of flow (visualizer_usage,
-- visualizer_quota_overrides) already carry this FK; this brings the table in
-- line with them.
--
-- CASCADE rather than the SET NULL used by migration 093's ledger tables:
-- preferences are not a financial record, they are settings, and settings for
-- an account that no longer exists are noise. Erasure should take them.
--
-- Safe to apply: verified 0 orphan rows before writing this (1 row total, all
-- resolving to a live auth.users id), so the constraint validates without any
-- row being deleted or changed.

ALTER TABLE public.email_preferences
  DROP CONSTRAINT IF EXISTS email_preferences_user_id_fkey;

ALTER TABLE public.email_preferences
  ADD CONSTRAINT email_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
