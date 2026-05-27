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

export const runtime = "nodejs";

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
  const { data: blog } = await db
    .from("blogs")
    .select("id, author_user_id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; author_user_id: string; status: string }>();
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

  return NextResponse.json({ status: "edited" });
}
