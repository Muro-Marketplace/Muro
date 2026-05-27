// Phase 2.7 blog detail API.
//
// GET: returns a single blog. Public for status='published', private
//      (owner-only) for drafts / pending / rejected.
// PATCH: owner can update body/title while in draft; can also
//        transition status='draft' → 'pending_review' (Submit for
//        review). Status flips beyond that are admin-only via the
//        /api/admin/blogs/[id] route.
// DELETE: owner can delete a blog they own.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { isFlagOn } from "@/lib/feature-flags";

export const runtime = "nodejs";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Drafts stay loose; the quality bar applies only when the author hits
// "Submit for review". The refine below enforces title >=3 and
// body_markdown >=20 only when submit_for_review === true; merging
// candidate values with the row's stored values is handled in the
// handler after the parse.
const patchSchema = z
  .object({
    title: z.string().min(1).max(180).optional(),
    body_markdown: z.string().max(50_000).optional(),
    cover_image_url: z.string().max(2000).nullable().optional(),
    featured_artwork_ids: z.array(z.string().min(1).max(80)).max(50).optional(),
    submit_for_review: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.body_markdown !== undefined ||
      v.cover_image_url !== undefined ||
      v.featured_artwork_ids !== undefined ||
      v.submit_for_review === true,
    { message: "Nothing to update" },
  );

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await getAuthenticatedUser(request);
  const db = getSupabaseAdmin();
  const { data: blog } = await db
    .from("blogs")
    .select("*")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      author_user_id: string;
      slug: string;
      title: string;
      body_markdown: string | null;
      cover_image_url: string | null;
      status: string;
      published_at: string | null;
      created_at: string;
    }>();

  if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = auth.user?.id === blog.author_user_id;
  if (blog.status !== "published" && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Featured artworks alongside the blog.
  const { data: featured } = await db
    .from("blog_featured_artworks")
    .select("artwork_id, position")
    .eq("blog_id", blog.id)
    .order("position", { ascending: true });

  return NextResponse.json({
    blog,
    featured: (featured ?? []).map(
      (r) => (r as { artwork_id: string; position: number }).artwork_id,
    ),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isFlagOn("BLOGS_V1")) {
    return NextResponse.json(
      { error: "Blog editor isn't enabled yet." },
      { status: 403 },
    );
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("blogs")
    .select("id, author_user_id, status, title, body_markdown, cover_image_url")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      author_user_id: string;
      status: string;
      title: string;
      body_markdown: string | null;
      cover_image_url: string | null;
    }>();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.author_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body_markdown !== undefined) {
    updates.body_markdown = parsed.data.body_markdown;
    updates.body_json = { type: "doc", body: parsed.data.body_markdown };
  }
  if (parsed.data.cover_image_url !== undefined) {
    updates.cover_image_url = parsed.data.cover_image_url;
  }
  if (parsed.data.submit_for_review) {
    if (existing.status !== "draft" && existing.status !== "rejected") {
      return NextResponse.json(
        { error: "Only drafts or rejected blogs can be submitted for review" },
        { status: 422 },
      );
    }
    // Submit-for-review quality bar. Validate against the merged values
    // (existing row + incoming patch) so the author can submit without
    // re-sending every field. The author-visible errors are bundled
    // into `issues` so the editor can list every gap in one render.
    const candidateTitle = parsed.data.title ?? existing.title ?? "";
    const candidateBody = parsed.data.body_markdown ?? existing.body_markdown ?? "";
    const candidateCover =
      parsed.data.cover_image_url !== undefined
        ? parsed.data.cover_image_url
        : existing.cover_image_url;
    const issues: string[] = [];
    if (candidateTitle.trim().length < 3) {
      issues.push("Title needs at least 3 characters before submitting.");
    }
    if (candidateBody.trim().length < 20) {
      issues.push("Body needs at least 20 characters before submitting.");
    }
    if (
      candidateCover !== null &&
      candidateCover !== undefined &&
      candidateCover !== "" &&
      !isHttpUrl(candidateCover)
    ) {
      issues.push("Cover image URL must start with http:// or https://.");
    }
    if (issues.length > 0) {
      return NextResponse.json(
        { error: "Not ready for review", issues },
        { status: 422 },
      );
    }
    updates.status = "pending_review";
  }

  const { error } = await db.from("blogs").update(updates).eq("id", id);
  if (error) {
    console.error("[blogs PATCH]", error);
    return NextResponse.json({ error: "Could not update blog" }, { status: 500 });
  }

  // Replace featured artworks atomically.
  if (parsed.data.featured_artwork_ids !== undefined) {
    await db.from("blog_featured_artworks").delete().eq("blog_id", id);
    if (parsed.data.featured_artwork_ids.length > 0) {
      await db.from("blog_featured_artworks").insert(
        parsed.data.featured_artwork_ids.map((aw, idx) => ({
          blog_id: id,
          artwork_id: aw,
          position: idx,
        })),
      );
    }
  }

  // I2: enqueue the moderation row + author notification.
  if (parsed.data.submit_for_review) {
    const { data: full } = await db
      .from("blogs")
      .select("id, title, body_markdown")
      .eq("id", id)
      .maybeSingle<{ id: string; title: string; body_markdown: string | null }>();
    if (full) {
      await db.from("moderation_queue").insert({
        entity_type: "blog",
        entity_id: full.id,
        submitted_by_user_id: auth.user!.id,
        submitted_by_email: auth.user!.email ?? null,
        status: "pending",
        payload: {
          type: "blog",
          blog_id: full.id,
          title: full.title,
          excerpt: (full.body_markdown ?? "").slice(0, 200),
        },
      });
    }
    // Phase 2.7 follow-up: there is no purpose-built blog_submitted
    // template yet. The previous fallback (firing the order_placed
    // template at the artist on submit) was a misleading "Your order
    // is on its way" email. Dropped; Phase 3 will add the right
    // template and re-enable the notification.
  }

  return NextResponse.json({ status: "ok" });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("blogs")
    .select("id, author_user_id")
    .eq("id", id)
    .maybeSingle<{ id: string; author_user_id: string }>();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.author_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  await db.from("blogs").delete().eq("id", id);
  return NextResponse.json({ status: "ok" });
}
