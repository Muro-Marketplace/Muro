// Phase 2.8 A2. Admin dispute list. Filter by status, category, and
// age (days). Read-only; mutations live on the [id] handler.

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set(["open", "resolved", "closed"]);

export async function GET(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const category = url.searchParams.get("category") || "";
  const olderThanDays = Number(url.searchParams.get("older_than_days") || "0");

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "Invalid status" },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  let query = db
    .from("disputes")
    .select(
      "id, opener_user_id, conversation_id, order_id, placement_id, status, category, description, resolution, resolved_at, resolved_by_user_id, created_at",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (category) query = query.eq("category", category);
  if (olderThanDays > 0) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.lte("created_at", cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/disputes GET]", error);
    return NextResponse.json({ error: "Could not load disputes" }, { status: 500 });
  }
  return NextResponse.json({ disputes: data ?? [] });
}
