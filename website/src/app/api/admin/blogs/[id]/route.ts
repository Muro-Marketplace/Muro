// Phase 2.7 A4. Admin actions on a single blog: approve, reject (with
// reason), or edit. Approving flips status to 'published',
// published_at to now(), and stamps the moderation_queue row. Rejecting
// flips status to 'rejected' and records the reason. Editing pulls the
// whole blog into the admin editor (handled client-side); this route
// just persists the new content.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email/send";
import { ArtistBlogPublished } from "@/emails/templates/artist-additions/ArtistBlogPublished";
import { ArtistBlogRejected } from "@/emails/templates/artist-additions/ArtistBlogRejected";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

type AdminDb = ReturnType<typeof getSupabaseAdmin>;

// G13. The admin queue row carries a 200-character excerpt, which is what an
// admin was approving on. The public /api/blogs/[id] is owner-only for anything
// unpublished, so there was no route that would show a moderator the body they
// were about to publish. This is that route.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;

  const db = getSupabaseAdmin();
  const { data: blog } = await db
    .from("blogs")
    .select(
      "id, author_user_id, status, title, slug, body_markdown, cover_image_url, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reading an unpublished post is reading a named author's unpublished work,
  // so it is audited on the same terms as the queue read. Ids only.
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "blog.read",
    context: { blog_id: id },
  });

  return NextResponse.json({ blog });
}

/**
 * The author's address and first name, or null when neither can be resolved.
 *
 * G15: a decision the author never hears about is the defect, so this is
 * best-effort by design. A missing auth user must not block the publish.
 */
async function blogAuthor(
  db: AdminDb,
  authorUserId: string | null,
): Promise<{ email: string; firstName: string; userId: string } | null> {
  if (!authorUserId) return null;
  try {
    const { data } = await db.auth.admin.getUserById(authorUserId);
    const email = data?.user?.email;
    if (!email) return null;
    const meta = (data.user!.user_metadata ?? {}) as Record<string, unknown>;
    const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
    return {
      email,
      firstName: (displayName || "there").split(" ")[0],
      userId: authorUserId,
    };
  } catch (err) {
    console.error("[admin/blogs] could not resolve the author:", err);
    return null;
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().min(2).max(2000),
  }),
  z.object({
    action: z.literal("edit"),
    title: z.string().min(3).max(180).optional(),
    body_markdown: z.string().min(20).max(50_000).optional(),
    cover_image_url: z.string().url().nullable().optional(),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // title + slug come along because the decision email names the post and
  // links to it. Selecting only the ids is how G15 stayed invisible.
  const { data: blog } = await db
    .from("blogs")
    .select("id, author_user_id, status, title, slug")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      author_user_id: string;
      status: string;
      title: string | null;
      slug: string | null;
    }>();
  if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "approve") {
    const now = new Date().toISOString();
    await db
      .from("blogs")
      .update({ status: "published", published_at: now })
      .eq("id", id);
    await db
      .from("moderation_queue")
      .update({
        status: "approved",
        decided_by_user_id: auth.user!.id,
        decided_at: now,
      })
      .eq("entity_type", "blog")
      .eq("entity_id", id);
    await recordAdminAction({
      adminUserId: auth.user!.id,
      action: "blog.approve",
      context: { blog_id: id },
    });

    // G15. Best-effort: sendEmail never throws, and a decision that reached the
    // database must not be reported as failed because the notice did not send.
    const author = await blogAuthor(db, blog.author_user_id);
    if (author) {
      await sendEmail({
        idempotencyKey: `blog_published:${id}`,
        template: "artist_blog_published",
        category: "placements",
        to: author.email,
        userId: author.userId,
        subject: "Your Wallplace post is live",
        react: ArtistBlogPublished({
          firstName: author.firstName,
          title: blog.title || "your post",
          blogUrl: `${SITE}/journal/${encodeURIComponent(blog.slug || id)}`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { blogId: id },
      });
    }

    return NextResponse.json({ status: "approved" });
  }

  if (parsed.data.action === "reject") {
    const now = new Date().toISOString();
    await db
      .from("blogs")
      .update({ status: "rejected" })
      .eq("id", id);
    await db
      .from("moderation_queue")
      .update({
        status: "rejected",
        decided_by_user_id: auth.user!.id,
        decided_at: now,
        reason: parsed.data.reason,
      })
      .eq("entity_type", "blog")
      .eq("entity_id", id);
    await recordAdminAction({
      adminUserId: auth.user!.id,
      action: "blog.reject",
      context: { blog_id: id, reason: parsed.data.reason },
    });

    // G14 + G15. The admin prompt says the reason is visible to the author.
    // Until this send existed it was visible to nobody but the queue row.
    const author = await blogAuthor(db, blog.author_user_id);
    if (author) {
      await sendEmail({
        idempotencyKey: `blog_rejected:${id}`,
        template: "artist_blog_rejected",
        category: "placements",
        to: author.email,
        userId: author.userId,
        subject: "A note on your Wallplace post",
        react: ArtistBlogRejected({
          firstName: author.firstName,
          title: blog.title || "your post",
          reason: parsed.data.reason,
          editUrl: `${SITE}/artist-portal/blogs`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { blogId: id },
      });
    }

    return NextResponse.json({ status: "rejected" });
  }

  // action === "edit"
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body_markdown !== undefined) {
    updates.body_markdown = parsed.data.body_markdown;
    updates.body_json = { type: "doc", body: parsed.data.body_markdown };
  }
  if (parsed.data.cover_image_url !== undefined) {
    updates.cover_image_url = parsed.data.cover_image_url;
  }
  if (Object.keys(updates).length > 0) {
    await db.from("blogs").update(updates).eq("id", id);
  }
  await db
    .from("moderation_queue")
    .update({
      status: "edited",
      decided_by_user_id: auth.user!.id,
      decided_at: new Date().toISOString(),
    })
    .eq("entity_type", "blog")
    .eq("entity_id", id);
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "blog.edit",
    context: { blog_id: id, fields: Object.keys(updates) },
  });

  return NextResponse.json({ status: "edited" });
}
