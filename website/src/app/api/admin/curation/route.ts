import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("curation_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("admin curation list error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [] });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending_payment", "awaiting_quote", "paid", "in_progress", "shortlist_sent", "completed", "cancelled", "refunded"]).optional(),
  adminNotes: z.string().max(4000).optional(),
});

export async function PATCH(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.adminNotes !== undefined) updates.admin_notes = parsed.data.adminNotes;

  const db = getSupabaseAdmin();
  const { error } = await db.from("curation_requests").update(updates).eq("id", parsed.data.id);
  if (error) {
    console.error("admin curation update error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
