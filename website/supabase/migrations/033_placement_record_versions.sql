-- Version log for placement_records. Every PUT snapshots the pre-change
-- row into this table before applying the new values, so both parties
-- can see who edited what and when. Each new version also clears both
-- approval ticks on the live record — the other party has to re-approve
-- the revised terms.
CREATE TABLE IF NOT EXISTS placement_record_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id TEXT NOT NULL,
  version_of_record_id UUID,
  changed_by_user_id UUID NOT NULL,
  changed_by_role TEXT,
  snapshot JSONB NOT NULL,
  changed_fields TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placement_record_versions_placement_id
  ON placement_record_versions(placement_id, created_at DESC);
