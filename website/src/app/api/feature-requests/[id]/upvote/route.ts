// POST /api/feature-requests/[id]/upvote — toggle an upvote.
// Auth required. Idempotent: hitting it twice toggles back off.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  // Try insert; if conflict, the user already upvoted — delete to toggle off.
  const { error: insertErr } = await db
    .from("feature_request_upvotes")
    .insert({ request_id: id, user_id: userId });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      // Already there — toggle off.
      await db.from("feature_request_upvotes").delete().eq("request_id", id).eq("user_id", userId);
      const { count } = await db
        .from("feature_request_upvotes")
        .select("user_id", { count: "exact", head: true })
        .eq("request_id", id);
      await db.from("feature_requests").update({ upvotes: count ?? 0, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ upvoted: false, upvotes: count ?? 0 });
    }
    console.error("[upvote POST]", insertErr);
    return NextResponse.json({ error: "Could not upvote" }, { status: 500 });
  }

  const { count } = await db
    .from("feature_request_upvotes")
    .select("user_id", { count: "exact", head: true })
    .eq("request_id", id);
  await db.from("feature_requests").update({ upvotes: count ?? 1, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ upvoted: true, upvotes: count ?? 1 });
}
