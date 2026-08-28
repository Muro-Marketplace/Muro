// Phase 2.1 A5/A6. Admin-only moderation queue reader. Filters by
// entity_type so the feature-requests and feedback admin pages can
// share one endpoint.
//
// G27: PATCH records an approve/reject decision on a pending queue row
// (message, feature_request or feedback). Blog decisions carry side
// effects beyond the queue (publishing or rejecting the blog row
// itself) and stay on PATCH /api/admin/blogs/[id]; deciding a blog row
// here would fork the queue status from the blog's own status.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parsePayload, type ModerationEntityType } from "@/lib/moderation/types";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["blog", "feature_request", "feedback", "message"]);
const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "edited"]);

export async function GET(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type") || "";
  const status = url.searchParams.get("status") || "pending";

  if (!ALLOWED_TYPES.has(entityType)) {
    return NextResponse.json(
      { error: "entity_type must be one of: blog, feature_request, feedback, message" },
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
      payload: parsePayload(r.entity_type as ModerationEntityType, r.payload),
    };
  });

  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "moderation.read",
    context: { entity_type: entityType, status, row_count: rows.length },
  });

  return NextResponse.json({ rows });
}

const decideSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().uuid(), action: z.literal("approve") }),
  z.object({
    id: z.string().uuid(),
    action: z.literal("reject"),
    reason: z.string().min(2).max(2000).optional(),
  }),
]);

export async function PATCH(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: row, error: readError } = await db
    .from("moderation_queue")
    .select("id, entity_type, entity_id, status")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; entity_type: string; entity_id: string; status: string }>();

  if (readError) {
    console.error("[admin/moderation PATCH]", readError);
    return NextResponse.json({ error: "Could not load that queue row" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.entity_type === "blog") {
    return NextResponse.json(
      { error: "Blog decisions go through /api/admin/blogs/[id]" },
      { status: 400 },
    );
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  const decidedStatus = parsed.data.action === "approve" ? "approved" : "rejected";
  const update: Record<string, unknown> = {
    status: decidedStatus,
    decided_by_user_id: auth.user!.id,
    decided_at: new Date().toISOString(),
  };
  if (parsed.data.action === "reject" && parsed.data.reason) {
    update.reason = parsed.data.reason;
  }

  // The status guard on the update itself closes the read-then-write race:
  // two admins deciding the same row concurrently cannot both win.
  const { error: updateError } = await db
    .from("moderation_queue")
    .update(update)
    .eq("id", row.id)
    .eq("status", "pending");

  if (updateError) {
    console.error("[admin/moderation PATCH]", updateError);
    return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });
  }

  // Ids and the action only. The reject reason is free text an admin typed
  // about a named user; it lives on the queue row, which is already
  // queryable, so the audit log records THAT a decision happened, not what
  // the admin wrote (same call the curation audit made for admin_notes).
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "moderation.decide",
    context: {
      queue_id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: parsed.data.action,
    },
  });

  return NextResponse.json({ status: decidedStatus });
}
