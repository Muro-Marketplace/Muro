// Phase 2.8 A2. Admin actions on a single dispute. Each action writes
// an admin_audit_log row.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    resolution: z.string().min(2).max(2000),
  }),
  z.object({ action: z.literal("close") }),
  z.object({
    action: z.literal("escalate"),
    note: z.string().max(2000).optional(),
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
  const { data: dispute } = await db
    .from("disputes")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  let updates: Record<string, unknown> = {};

  if (parsed.data.action === "resolve") {
    updates = {
      status: "resolved",
      resolution: parsed.data.resolution,
      resolved_at: now,
      resolved_by_user_id: auth.user!.id,
    };
  } else if (parsed.data.action === "close") {
    updates = { status: "closed", resolved_at: now, resolved_by_user_id: auth.user!.id };
  } else {
    // escalate keeps status open but stamps a category-like flag.
    updates = { category: "escalated" };
  }

  const { error } = await db.from("disputes").update(updates).eq("id", id);
  if (error) {
    console.error("[admin/disputes PATCH]", error);
    return NextResponse.json({ error: "Could not update dispute" }, { status: 500 });
  }

  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: `dispute.${parsed.data.action}`,
    context: {
      dispute_id: id,
      ...("resolution" in parsed.data
        ? { resolution: parsed.data.resolution }
        : "note" in parsed.data && parsed.data.note
          ? { note: parsed.data.note }
          : {}),
    },
  });

  return NextResponse.json({ status: "ok" });
}
