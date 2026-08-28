-- 107: double opt-in for the newsletter (09 §D.3, item 3.5).
--
-- The intent was always there and never implemented. `email_preferences.
-- newsletter_enabled` defaults to false with the comment "double opt-in"
-- (016_email_infrastructure.sql:43), and `newsletter_subscribers` (018) has no
-- token column, so there was no way to confirm anything and nothing ever set
-- that flag true. The result: subscribing did nothing a person could observe,
-- and anyone could subscribe anyone else's address.
--
-- `confirm_token` is UNIQUE so the confirm route can look a row up by token
-- alone. It is CLEARED on confirmation rather than kept, so a forwarded or
-- logged link is single-use and a leaked mailbox archive is not a standing
-- capability.
--
-- THE THREE EXISTING SUBSCRIBERS ARE GRANDFATHERED AS CONFIRMED.
--
-- They subscribed under single opt-in, which is consent: they typed their
-- address into a form and pressed a button. Leaving them NULL would look like
-- the cautious choice and is not, because every future "send only to confirmed"
-- query would then silently exclude three real people who did opt in and were
-- never given a link to click. `confirmed_at` is set to their own
-- `subscribed_at`, not to now, so the row does not claim a confirmation
-- happened today. Reversible with a single UPDATE if the owner disagrees.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirm_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Partial: only unconfirmed rows carry a token, so the index stays small and
-- the confirm lookup never scans confirmed history.
CREATE INDEX IF NOT EXISTS newsletter_confirm_token_idx
  ON public.newsletter_subscribers(confirm_token) WHERE confirm_token IS NOT NULL;

UPDATE public.newsletter_subscribers
   SET confirmed_at = subscribed_at
 WHERE confirmed_at IS NULL AND confirm_token IS NULL;

NOTIFY pgrst, 'reload schema';
