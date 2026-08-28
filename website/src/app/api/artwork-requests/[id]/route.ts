// /api/artwork-requests/[id] — read one request + close it.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import {
  assertCanViewArtworkRequest,
  handleAuthzError,
  type ArtworkRequestRef,
  type ArtworkRequestViewerRole,
} from "@/lib/authz";

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
  // E17. This read used to be completely unauthenticated, so anyone could pull a
  // private brief (description, budgets, location, the invited-artist list) plus
  // every rival artist's response. Visibility is decided by
  // assertCanViewArtworkRequest: the owning venue, an artist named on a private
  // row, or any approved artist on a semi_public row. Everyone else gets 404
  // rather than 403, so the endpoint is not an existence oracle.
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const db = getSupabaseAdmin();

  let req: ArtworkRequestRef;
  let role: ArtworkRequestViewerRole;
  try {
    ({ request: req, role } = await assertCanViewArtworkRequest(auth.user!, id, db));
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    throw err;
  }
  // Plan G2 #4: surface the venue's NAME alongside the slug for the
  // artist-portal detail page. Done as a separate lookup, not an
  // embedded PostgREST join, because there's no FK between
  // artwork_requests.venue_user_id and venue_profiles.user_id (both
  // reference auth.users.id) — the embed silently 500s and breaks
  // the whole endpoint.
  const venueUserId = req.venue_user_id;
  const { data: venueRow } = await db
    .from("venue_profiles")
    .select("name")
    .eq("user_id", venueUserId)
    .maybeSingle<{ name: string | null }>();

  // E18. Only the owning venue sees the full response set. An artist viewing the
  // brief sees their own response and nothing else, so they can tell whether they
  // have already replied without reading rival terms first.
  let responsesQuery = db
    .from("artwork_request_responses")
    .select("*")
    .eq("request_id", id);
  if (role !== "owner") {
    responsesQuery = responsesQuery.eq("artist_user_id", auth.user!.id);
  }
  const { data: responses } = await responsesQuery.order("created_at", { ascending: false });

  const requestRow = { ...req, venue_name: venueRow?.name ?? null };

  return NextResponse.json({ request: requestRow, responses: responses || [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;
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
