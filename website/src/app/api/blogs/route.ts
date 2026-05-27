// Phase 2.7 blog API. List endpoint (public) returns published rows
// only; authenticated POST creates a new draft owned by the calling
// artist. PATCH / submit-for-review live on the [id] handler.
//
// Auth model:
//   - GET: anonymous OK, returns only status='published'.
//   - POST: requires a signed-in artist (artist_profiles row).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { slugify } from "@/lib/slugify";
import { isFlagOn } from "@/lib/feature-flags";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(3).max(180),
  body_markdown: z.string().min(20).max(50_000),
  cover_image_url: z.string().url().optional(),
  featured_artwork_ids: z.array(z.string().min(1).max(80)).max(50).optional(),
});

export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("blogs")
    .select(
      "id, slug, title, body_markdown, cover_image_url, author_user_id, published_at, created_at",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[blogs GET]", error);
    return NextResponse.json({ error: "Could not load blogs" }, { status: 500 });
  }

  // Fan in author slug+name so the index card can render the byline
  // without a follow-up round-trip.
  const authorIds = Array.from(
    new Set((data ?? []).map((r) => (r as { author_user_id: string }).author_user_id)),
  );
  const authors = new Map<string, { slug: string; name: string }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await db
      .from("artist_profiles")
      .select("user_id, slug, name")
      .in("user_id", authorIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; slug: string; name: string }>) {
      authors.set(p.user_id, { slug: p.slug, name: p.name });
    }
  }

  return NextResponse.json({
    blogs: (data ?? []).map((r) => {
      const row = r as {
        id: string;
        slug: string;
        title: string;
        body_markdown: string | null;
        cover_image_url: string | null;
        author_user_id: string;
        published_at: string | null;
        created_at: string;
      };
      const author = authors.get(row.author_user_id);
      return {
        ...row,
        author_slug: author?.slug ?? null,
        author_name: author?.name ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!isFlagOn("BLOGS_V1")) {
    return NextResponse.json(
      { error: "Blog editor isn't enabled yet." },
      { status: 403 },
    );
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  // Authoring requires an artist profile (the public byline links to
  // /browse/<artist-slug>).
  const { data: artist } = await db
    .from("artist_profiles")
    .select("user_id, slug")
    .eq("user_id", auth.user!.id)
    .maybeSingle<{ user_id: string; slug: string }>();
  if (!artist) {
    return NextResponse.json(
      { error: "Only artists can author blogs." },
      { status: 403 },
    );
  }

  // Slug derivation. Append a 6-char suffix to keep uniqueness
  // without trying to be clever about title collisions.
  const baseSlug = slugify(parsed.data.title).slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${baseSlug || "post"}-${suffix}`;

  const { data, error } = await db
    .from("blogs")
    .insert({
      author_user_id: artist.user_id,
      slug,
      title: parsed.data.title,
      body_markdown: parsed.data.body_markdown,
      // Phase 2.7 simplified scope: we don't ship a structured editor
      // yet, so body_json mirrors the markdown as a single block. The
      // schema requires body_json NOT NULL.
      body_json: { type: "doc", body: parsed.data.body_markdown },
      cover_image_url: parsed.data.cover_image_url ?? null,
      status: "draft",
    })
    .select("id, slug")
    .single<{ id: string; slug: string }>();

  if (error || !data) {
    console.error("[blogs POST]", error);
    return NextResponse.json(
      { error: "Could not create blog." },
      { status: 500 },
    );
  }

  // Persist featured artworks if provided.
  const featured = parsed.data.featured_artwork_ids ?? [];
  if (featured.length > 0) {
    await db.from("blog_featured_artworks").insert(
      featured.map((aw, idx) => ({
        blog_id: data.id,
        artwork_id: aw,
        position: idx,
      })),
    );
  }

  return NextResponse.json({ blog: data });
}
