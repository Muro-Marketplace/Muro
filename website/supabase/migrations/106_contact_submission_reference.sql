-- 106: an opaque reference for contact submissions (09 §D.4, item 3.4).
--
-- §D.4 says to quote `submission.id` back at the sender as their reference. Two
-- things about the live table make that wrong, and both are worth writing down
-- because the doc was written against an assumption, not against prod.
--
-- 1. `id` is a BIGINT SEQUENCE, not a uuid. Reference "6" tells the sender that
--    Wallplace has received six contact submissions ever. Submit twice a month
--    apart and the gap is the growth rate. That is a business metric handed to
--    anyone who fills in a form, and it never stops leaking.
--
-- 2. Reading the id back needs `.select()` after the insert, and the route uses
--    the ANON client. `contact_submissions` has INSERT policies and NO SELECT
--    policy, so PostgREST's RETURNING would be filtered to zero rows: the row
--    would be written and the route would answer 500. Following §D.4 literally
--    would have broken the contact form on every submission.
--
-- So the route generates the reference and inserts it, and never reads anything
-- back. The DEFAULT here is the backstop for any other writer.
--
-- Format: WP-XXXXXXXX, 8 hex characters, 4.3 billion values. Short enough to
-- read down a phone, wide enough that guessing one is pointless, and it carries
-- no ordering.

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS reference TEXT;

-- The five existing rows predate this and have no reference. Give them one so
-- the column is uniformly populated and the unique index below can be built.
UPDATE public.contact_submissions
   SET reference = 'WP-' || upper(encode(gen_random_bytes(4), 'hex'))
 WHERE reference IS NULL;

ALTER TABLE public.contact_submissions
  ALTER COLUMN reference SET DEFAULT ('WP-' || upper(encode(gen_random_bytes(4), 'hex')));

-- Unique so a reference identifies exactly one submission, which is the only
-- reason to have one. NOT NULL is deliberately left off: the default covers
-- every insert, and a NOT NULL here would turn any future writer that forgets
-- the column into a failed contact form rather than a row with a default.
CREATE UNIQUE INDEX IF NOT EXISTS contact_submissions_reference_idx
  ON public.contact_submissions(reference);

NOTIFY pgrst, 'reload schema';
