// Phase 2.7: returns blogs owned by the calling artist, every status.
// Used by the artist-portal index.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("blogs")
    // Migration 128: the rejection reason, so the author sees WHY rather than a
    // bare "Rejected" badge. It was written to admin_audit_log and the
    // moderation_queue row, neither of which an artist can read.
    .select("id, slug, title, status, created_at, published_at, rejection_reason")
    .eq("author_user_id", auth.user!.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[blogs/mine]", error);
    return NextResponse.json({ error: "Could not load blogs" }, { status: 500 });
  }
  return NextResponse.json({ blogs: data ?? [] });
}
