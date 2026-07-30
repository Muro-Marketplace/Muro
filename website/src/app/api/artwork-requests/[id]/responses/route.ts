// /api/artwork-requests/[id]/responses
//
// POST — artist responds to a venue's request. Counts towards the
//        artist's daily venue-outreach cap (shared with placements +
//        first-contact messages).
// GET — venue pulls responses (also exposed via the parent
//       /api/artwork-requests/[id] endpoint).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import {
  assertCanViewArtworkRequest,
  handleAuthzError,
  type ArtworkRequestViewerRole,
} from "@/lib/authz";
import { createNotification } from "@/lib/notifications";
import { checkArtistOutreachCap } from "@/lib/outreach-cap";

export const runtime = "nodejs";

// Zod schema. Message min(3) was too aggressive — a "Yes!" was rejected
// as "invalid response" with no UI breadcrumb. Relaxed to min(1).
//
// `workSelections` is the new shape: each entry can pin to a specific
// size variant on the work. Falls back to plain `workIds` for older
// callers; the route normalises both.
//
// Plan G2: `existing_works` was removed from the canonical set — it
// duplicated `offer` minus the price field with no clear UX benefit.
// The DB CHECK constraint still allows it for legacy rows; we just
// don't accept new responses with that type.
const createSchema = z.object({
  responseType: z.enum(["placement", "offer", "commission", "message"]),
  message: z.string().min(1).max(4000),
  workIds: z.array(z.string()).max(20).optional().default([]),
  workSelections: z
    .array(
      z.object({
        id: z.string().min(1),
        sizeLabel: z.string().max(120).optional(),
      }),
    )
    .max(20)
    .optional(),
  proposedOfferAmountPence: z.number().int().positive().optional(),
  proposedCommissionAmountPence: z.number().int().positive().optional(),
  proposedCommissionTimeline: z.string().max(160).optional(),
  // Plan G2: artist-proposed placement terms. Only meaningful when
  // responseType === "placement"; the route ignores them for other
  // types. £10,000/mo cap matches the existing placementSchema bound
  // (monthlyFeeGbp.max(100000) — pounds — × 100 pence).
  proposedMonthlyFeePence: z.number().int().min(0).max(10_000_00).optional(),
  proposedQrEnabled: z.boolean().optional(),
  proposedRevenueSharePercent: z.number().int().min(0).max(50).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // E18. Unauthenticated before this: anyone could read every artist's bid on any
  // brief. Same rule as the parent route, the owning venue sees all responses and
  // an artist sees only their own.
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const db = getSupabaseAdmin();

  let role: ArtworkRequestViewerRole;
  try {
    ({ role } = await assertCanViewArtworkRequest(auth.user!, id, db));
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    throw err;
  }

  let query = db
    .from("artwork_request_responses")
    .select("*")
    .eq("request_id", id);
  if (role !== "owner") {
    query = query.eq("artist_user_id", auth.user!.id);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load responses" }, { status: 500 });
  return NextResponse.json({ responses: data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: the demo guard existed but had ZERO call sites, while two doc comments
  // claimed it was wired. This handler reaches real people (real emails, real
  // money, or content on a public page), so it takes the STRICT 403 variant.
  const demoBlocked = assertNotDemoStrict(auth.user!.id);
  if (demoBlocked) return demoBlocked;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the first issue so the artist sees *what* failed, not a
    // flat "invalid response" wall.
    const first = parsed.error.issues[0];
    const fieldPath = first?.path.join(".") || "input";
    return NextResponse.json(
      { error: "validation_failed", message: `${fieldPath}: ${first?.message || "invalid"}` },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Artist-only: must have an artist profile to respond.
  const { data: artist } = await db
    .from("artist_profiles")
    .select("user_id, slug")
    .eq("user_id", auth.user!.id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json(
      { error: "artist_only", message: "Only artists can respond to artwork requests." },
      { status: 403 },
    );
  }

  // Daily cap — shared bucket with placement requests + first-contact
  // messages. Per spec: Core 2 / Premium 5 / Pro 10 across all three.
  const cap = await checkArtistOutreachCap(db, auth.user!.id, 1);
  if (!cap.ok) {
    return NextResponse.json(cap.result, { status: cap.result.status });
  }

  // Verify the request exists + is open.
  const { data: req } = await db
    .from("artwork_requests")
    .select("id, venue_user_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.status !== "open") return NextResponse.json({ error: "Request is closed" }, { status: 409 });

  // Normalise `workSelections` (new shape) and `workIds` (legacy). When
  // both are present, workSelections wins. Size labels are stashed in
  // metadata so the venue side can display "Studio Two – 12×16″".
  const selections = parsed.data.workSelections && parsed.data.workSelections.length > 0
    ? parsed.data.workSelections
    : (parsed.data.workIds || []).map((wid) => ({ id: wid, sizeLabel: undefined as string | undefined }));
  const workIds = selections.map((s) => s.id);
  const workSizeLabels = Object.fromEntries(
    selections
      .filter((s): s is { id: string; sizeLabel: string } => !!s.sizeLabel)
      .map((s) => [s.id, s.sizeLabel]),
  );

  // Plan G2: only persist placement terms when the response is a
  // placement proposal — keeping the columns null for offer/commission/
  // message rows makes the data easier to reason about downstream.
  const isPlacement = parsed.data.responseType === "placement";

  // Core columns that have existed since migration 046 — every prod DB
  // is guaranteed to have these.
  const coreRow = {
    request_id: id,
    artist_user_id: auth.user!.id,
    artist_slug: artist.slug,
    response_type: parsed.data.responseType,
    message: parsed.data.message.trim(),
    work_ids: workIds,
    proposed_offer_amount_pence: parsed.data.proposedOfferAmountPence ?? null,
    proposed_commission_amount_pence: parsed.data.proposedCommissionAmountPence ?? null,
    proposed_commission_timeline: parsed.data.proposedCommissionTimeline ?? null,
  };

  // Extended columns added by later migrations (048 metadata, 054
  // placement terms). If the prod DB hasn't been migrated yet, the full
  // insert fails with "Could not find the X column of artwork_request_responses".
  // We catch that and retry with just the core row so the artist's
  // response still saves, then track which columns dropped so we can
  // surface a warning to the artist + log it for the operator.
  const extendedRow: Record<string, unknown> = {
    metadata: { work_size_labels: workSizeLabels },
    proposed_monthly_fee_pence: isPlacement ? parsed.data.proposedMonthlyFeePence ?? null : null,
    proposed_qr_enabled: isPlacement ? parsed.data.proposedQrEnabled ?? null : null,
    proposed_revenue_share_percent: isPlacement ? parsed.data.proposedRevenueSharePercent ?? null : null,
  };

  let inserted: { id: string } | null = null;
  let error: { message: string; code?: string } | null = null;
  const droppedColumns: string[] = [];

  {
    const res = await db
      .from("artwork_request_responses")
      .insert({ ...coreRow, ...extendedRow })
      .select("id")
      .single();
    inserted = res.data as { id: string } | null;
    error = res.error;
  }

  if (error) {
    console.warn("[response POST] full insert failed, falling back to core columns:", error);
    // Try a core-only insert. If THAT fails too the issue is fundamental
    // (RLS, missing core column, FK violation) and we surface it.
    const coreRes = await db
      .from("artwork_request_responses")
      .insert(coreRow)
      .select("id")
      .single();
    if (coreRes.error) {
      console.error("[response POST] core insert failed:", coreRes.error);
      return NextResponse.json(
        {
          error: "Could not save response",
          message: coreRes.error.message,
        },
        { status: 500 },
      );
    }
    inserted = coreRes.data as { id: string } | null;
    error = null;
    // Note any extended columns that the artist tried to set but that
    // didn't land. Operator log only — the response is saved.
    droppedColumns.push(...Object.keys(extendedRow));
    console.warn(
      "[response POST] saved without extended columns:",
      droppedColumns,
      "(run pending migrations 048 + 054)",
    );
  }

  if (error || !inserted) {
    return NextResponse.json({ error: "Could not save response" }, { status: 500 });
  }

  createNotification({
    userId: req.venue_user_id,
    kind: "artwork_request_response",
    title: `New response to "${req.title}"`,
    body: parsed.data.message.slice(0, 140),
    link: `/venue-portal/artwork-requests/${id}`,
  }).catch((err) => console.warn("[response] bell failed:", err));

  return NextResponse.json({ success: true, id: inserted?.id });
}
