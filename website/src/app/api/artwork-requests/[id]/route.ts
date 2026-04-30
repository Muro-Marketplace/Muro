// /api/artwork-requests/[id] — read one request + close it.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

// Patch schema covers two flavours of update on the same row:
//   1. Lifecycle changes  (status / visibility).
//   2. Content edits      (title, description, intent, …).
// Everything optional — we apply only what the venue sent. Min lengths
// match POST so a "Test" title still saves on edit.
const patchSchema = z.object({
  status: z.enum(["open", "closed", "fulfilled"]).optional(),
  // "public" stays accepted on PATCH for old rows that may still hold
  // it, but new selections only allow semi_public / private.
  visibility: z.enum(["public", "semi_public", "private"]).optional(),
  title: z.string().min(2).max(160).optional(),
  description: z.string().min(2).max(4000).optional(),
  intent: z.array(z.enum(["purchase", "commission", "display", "loan"])).min(1).max(4).optional(),
  qrRevenueSharePercent: z.number().int().min(0).max(100).nullable().optional(),
  styles: z.array(z.string()).max(10).optional(),
  mediums: z.array(z.string()).max(10).optional(),
  budgetMinPence: z.number().int().nonnegative().nullable().optional(),
  budgetMaxPence: z.number().int().nonnegative().nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  timescale: z.enum(["asap", "weeks", "months", "flexible"]).nullable().optional(),
  invitedArtistSlugs: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: req } = await db.from("artwork_requests").select("*").eq("id", id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pull responses (artist replies) too.
  const { data: responses } = await db
    .from("artwork_request_responses")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ request: req, responses: responses || [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    // Surface zod's first issue so the edit form can show what failed.
    const first = parsed.error.issues[0];
    const fieldPath = first?.path.join(".") || "input";
    return NextResponse.json(
      { error: "validation_failed", message: `${fieldPath}: ${first?.message || "invalid"}` },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("artwork_requests").select("venue_user_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Map camelCase props -> the snake_case columns the table uses.
  // Each field is conditionally added so a partial PATCH stays partial.
  const p = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.status) updates.status = p.status;
  if (p.visibility) updates.visibility = p.visibility;
  if (p.title !== undefined) updates.title = p.title.trim();
  if (p.description !== undefined) updates.description = p.description.trim();
  if (p.intent !== undefined) updates.intent = p.intent;
  if (p.qrRevenueSharePercent !== undefined) updates.qr_revenue_share_percent = p.qrRevenueSharePercent;
  if (p.styles !== undefined) updates.styles = p.styles;
  if (p.mediums !== undefined) updates.mediums = p.mediums;
  if (p.budgetMinPence !== undefined) updates.budget_min_pence = p.budgetMinPence;
  if (p.budgetMaxPence !== undefined) updates.budget_max_pence = p.budgetMaxPence;
  if (p.location !== undefined) updates.location = p.location;
  if (p.timescale !== undefined) updates.timescale = p.timescale;
  if (p.invitedArtistSlugs !== undefined) updates.invited_artist_slugs = p.invitedArtistSlugs;
  if (p.status === "closed" || p.status === "fulfilled") {
    updates.closed_at = new Date().toISOString();
  }

  const { error } = await db.from("artwork_requests").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
