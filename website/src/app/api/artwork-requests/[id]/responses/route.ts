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
import { createNotification } from "@/lib/notifications";
import { checkArtistOutreachCap } from "@/lib/outreach-cap";

export const runtime = "nodejs";

// Zod schema. Message min(3) was too aggressive — a "Yes!" was rejected
// as "invalid response" with no UI breadcrumb. Relaxed to min(1).
//
// `workSelections` is the new shape: each entry can pin to a specific
// size variant on the work. Falls back to plain `workIds` for older
// callers; the route normalises both.
const createSchema = z.object({
  responseType: z.enum(["existing_works", "placement", "offer", "commission", "message"]),
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
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("artwork_request_responses")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load responses" }, { status: 500 });
  return NextResponse.json({ responses: data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

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

  const { data: inserted, error } = await db
    .from("artwork_request_responses")
    .insert({
      request_id: id,
      artist_user_id: auth.user!.id,
      artist_slug: artist.slug,
      response_type: parsed.data.responseType,
      message: parsed.data.message.trim(),
      work_ids: workIds,
      // Size labels live in metadata jsonb to avoid a schema migration
      // for a v1 nicety. Venue side reads work_size_labels[workId].
      metadata: { work_size_labels: workSizeLabels },
      proposed_offer_amount_pence: parsed.data.proposedOfferAmountPence ?? null,
      proposed_commission_amount_pence: parsed.data.proposedCommissionAmountPence ?? null,
      proposed_commission_timeline: parsed.data.proposedCommissionTimeline ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[response POST]", error);
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
