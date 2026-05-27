-- 061_blogs.sql
--
-- Phase 1 chunk 1e. Authored editorial content. Posts can feature an
-- unlimited number of artworks per the Phase 1 decisions ("Featured
-- works in blogs: unlimited").
--
-- Additive only. Phase 2 owns the editor UI, the public /blog routes,
-- and the moderation workflow that feeds moderation_queue (mig 058).
--
-- RLS:
--   - Authors can read + write their own rows in any status.
--   - Anyone (including anon) can SELECT rows where status='published'.
--   - Admin reads via the service-role client.

CREATE TABLE IF NOT EXISTS blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body_json JSONB NOT NULL,
  body_markdown TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','published','rejected','archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blogs_status_published_idx
  ON blogs(status, published_at DESC);
CREATE INDEX IF NOT EXISTS blogs_author_idx
  ON blogs(author_user_id, created_at DESC);

ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "blogs_select_published_or_own" ON blogs
    FOR SELECT USING (status = 'published' OR auth.uid() = author_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "blogs_insert_own" ON blogs
    FOR INSERT WITH CHECK (auth.uid() = author_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "blogs_update_own" ON blogs
    FOR UPDATE USING (auth.uid() = author_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "blogs_delete_own" ON blogs
    FOR DELETE USING (auth.uid() = author_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS blog_featured_artworks (
  blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  artwork_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (blog_id, artwork_id)
);

CREATE INDEX IF NOT EXISTS blog_featured_artworks_blog_idx
  ON blog_featured_artworks(blog_id, position);
CREATE INDEX IF NOT EXISTS blog_featured_artworks_artwork_idx
  ON blog_featured_artworks(artwork_id);

ALTER TABLE blog_featured_artworks ENABLE ROW LEVEL SECURITY;

-- Featured-artwork rows inherit blog visibility: a row is visible iff the
-- parent blog is visible to the caller under the blogs RLS above. Anon
-- and authenticated readers see featured artworks for any published blog;
-- authors see their own drafts' featured rows.
DO $$ BEGIN
  CREATE POLICY "blog_featured_artworks_select" ON blog_featured_artworks
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM blogs b
        WHERE b.id = blog_featured_artworks.blog_id
          AND (b.status = 'published' OR b.author_user_id = auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "blog_featured_artworks_write_own" ON blog_featured_artworks
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM blogs b
        WHERE b.id = blog_featured_artworks.blog_id
          AND b.author_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
