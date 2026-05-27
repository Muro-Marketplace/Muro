// Phase 2.1 A5/A6. Admin-only moderation queue reader. Filters by
// entity_type so the feature-requests and feedback admin pages can
// share one endpoint. Phase 2.7 (A4) extends this with a PATCH for
// blog approve/reject decisions; today the queue is read-only.

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parsePayload } from "@/lib/moderation/types";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["blog", "feature_request", "feedback"]);
const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "edited"]);

export async function GET(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type") || "";
  const status = url.searchParams.get("status") || "pending";

  if (!ALLOWED_TYPES.has(entityType)) {
    return NextResponse.json(
      { error: "entity_type must be one of: blog, feature_request, feedback" },
      { status: 400 },
    );
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be one of: pending, approved, rejected, edited" },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("moderation_queue")
    .select(
      "id, entity_type, entity_id, submitted_by_user_id, submitted_by_email, status, decided_by_user_id, decided_at, reason, payload, created_at",
    )
    .eq("entity_type", entityType)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/moderation GET]", error);
    return NextResponse.json({ error: "Could not load queue" }, { status: 500 });
  }

  const rows = (data || []).map((row) => {
    const r = row as {
      id: string;
      entity_type: string;
      entity_id: string;
      submitted_by_user_id: string | null;
      submitted_by_email: string | null;
      status: string;
      decided_by_user_id: string | null;
      decided_at: string | null;
      reason: string | null;
      payload: unknown;
      created_at: string;
    };
    return {
      ...r,
      payload: parsePayload(
        r.entity_type as "blog" | "feature_request" | "feedback",
        r.payload,
      ),
    };
  });

  return NextResponse.json({ rows });
}
