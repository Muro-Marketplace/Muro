-- 041_placement_reviews.sql
--
-- Stores reviews left by either party after a placement winds down. The
-- placement_review_request cron prompts each side ~7 days after collection;
-- this table holds the result. One review per (placement, reviewer) — a
-- partial UNIQUE prevents a user accidentally submitting twice.

CREATE TABLE IF NOT EXISTS placement_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  placement_id text NOT NULL,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_reviews_unique
  ON placement_reviews(placement_id, reviewer_user_id);

CREATE INDEX IF NOT EXISTS idx_placement_reviews_reviewee
  ON placement_reviews(reviewee_user_id);

CREATE INDEX IF NOT EXISTS idx_placement_reviews_placement
  ON placement_reviews(placement_id);

ALTER TABLE placement_reviews ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
