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
import {
  assertCanViewArtworkRequest,
  handleAuthzError,
  type ArtworkRequestViewerRole,
} from "@/lib/authz";
import { createNotification } from "@/lib/notifications";
import { checkArtistOutreachCap, outreachCapPayload } from "@/lib/outreach-cap";
import { sendEmail } from "@/lib/email/send";
import { VenueBriefResponseReceived } from "@/emails/templates/artwork-requests/VenueBriefResponseReceived";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/** Matches the space the venue email's quote block is designed for. */
const PREVIEW_CHARS = 200;

function previewOf(text: string): string {
  const t = (text ?? "").trim();
  return t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS - 3)}…` : t;
}

/** How the venue email names each response type. */
const RESPONSE_TYPE_LABEL: Record<"placement" | "offer" | "commission" | "message", string> = {
  placement: "placement proposal",
  offer: "purchase offer",
  commission: "commission proposal",
  message: "message",
};

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
}).superRefine((data, ctx) => {
  // F44. The artist respond form labels the QR toggle "Required for revenue
  // share" and nothing enforced it on either side. A placement response with a
  // share above zero and QR off saved fine, and the accept handler then derived
  // arrangement_type "revenue_share" while writing qr_enabled false, because its
  // `resp.proposed_qr_enabled ?? (arrangementType === "revenue_share")` default
  // only covers null — an explicit false went straight through. The result is a
  // placement whose own terms contradict each other: the venue is owed a cut of
  // QR sales on a wall with no QR code, so the cut can never be earned.
  //
  // Scoped to placement responses because the route nulls these columns for
  // every other type, so there is no contradiction to guard against there.
  if (data.responseType !== "placement") return;
  const share = data.proposedRevenueSharePercent ?? 0;
  if (share > 0 && data.proposedQrEnabled !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proposedQrEnabled"],
      message:
        "a revenue share needs the QR code switched on, that is how sales from the wall are attributed",
    });
  }
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
    .select("user_id, slug, name")
    .eq("user_id", auth.user!.id)
    .maybeSingle<{ user_id: string; slug: string | null; name?: string | null }>();
  if (!artist) {
    return NextResponse.json(
      { error: "artist_only", message: "Only artists can respond to artwork requests." },
      { status: 403 },
    );
  }

  // E46d (06 B3). THE ACTUAL GAP. The POST's gates were: valid token, has an
  // artist profile, under the daily cap, request is open. Visibility and the
  // invite list were never consulted, while the sibling LIST route did enforce
  // them. So any signed-in artist could bid on a private brief they were never
  // invited to, and chained with the then-unauthenticated GETs could read every
  // rival bid first.
  //
  // The GET handlers above got this gate with 01's E17/E18 work. The POST did
  // not, which is easy to miss because both handlers live in this file and a
  // grep for the helper finds the GET's call.
  //
  // Placed after the artist-profile check so a non-artist still gets the clearer
  // artist_only 403, and BEFORE the outreach cap so a refused attempt does not
  // burn the artist's daily quota.
  //
  // Deviation from 06 §3.6, which asks for 403 not_invited: reusing
  // assertCanViewArtworkRequest instead, which denies 404
  // artwork_request_not_found. Same rule, one implementation rather than a second
  // one, and 404 does not confirm that a given private id exists. Writing the
  // doc's canArtistSeeRequest would have been a parallel copy of a rule that
  // already has one.
  try {
    await assertCanViewArtworkRequest(auth.user!, id, db);
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    throw err;
  }

  // E46d ordering: the request state is checked BEFORE the outreach cap, so a
  // rejected attempt does not burn the artist's daily quota. The visibility and
  // invite gate already runs earlier still, via assertCanViewArtworkRequest, but
  // this check sat after the cap, so responding to a CLOSED brief cost the artist
  // one of their two-to-ten daily sends for nothing.
  const { data: req } = await db
    .from("artwork_requests")
    .select("id, venue_user_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.status !== "open") return NextResponse.json({ error: "Request is closed" }, { status: 409 });

  // F45. There was no per-artist uniqueness anywhere: not a constraint, not a
  // check here, and no prior-response display on the respond page. So an artist
  // who resubmitted (a double-tap, a back-button, or simply not remembering)
  // filed a second bid on the same brief, the venue saw duplicates in their
  // response list, and every duplicate reached checkArtistOutreachCap below and
  // burned another of the artist's three-to-fifteen weekly sends.
  //
  // A DECLINE does not block a fresh attempt: "not these terms" is not "never
  // again", and the artist coming back with a revised proposal is a path worth
  // keeping. Anything still live or already actioned in the artist's favour
  // (sent / accepted / fulfilled) is refused.
  //
  // Sits BEFORE the cap for the same reason the closed-brief check does (E46d
  // ordering): a refused attempt must not cost the artist a send.
  const { data: prior } = await db
    .from("artwork_request_responses")
    .select("id, status")
    .eq("request_id", id)
    .eq("artist_user_id", auth.user!.id)
    .in("status", ["sent", "accepted", "fulfilled"])
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();
  if (prior) {
    return NextResponse.json(
      {
        error: "already_responded",
        message:
          prior.status === "sent"
            ? "You've already responded to this brief. The venue hasn't answered yet."
            : "You've already responded to this brief and the venue has answered.",
        responseId: prior.id,
        responseStatus: prior.status,
      },
      { status: 409 },
    );
  }

  // Rolling-week cap — shared bucket with placement requests + first-contact
  // messages. Core 3 / Premium 6 / Pro 15 across all three, per 7 days.
  // This used to return `cap.result` raw, which has no `error` key, so every
  // client reading `data.error` showed "Request failed (429)" instead of the
  // sentence explaining the cap.
  const cap = await checkArtistOutreachCap(db, auth.user!.id, 1);
  if (!cap.ok) {
    return NextResponse.json(outreachCapPayload(cap.result), { status: cap.result.status });
  }

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

  // "An artist responded to your brief", to the venue. The bell above was the
  // only signal, while the artist's side of the same exchange (accept,
  // decline) has emailed since F48. Best-effort, like those: a flaky mail
  // service or a missing profile must not fail a response already saved.
  // Keyed on the response row, which is unique per submission.
  try {
    const { data: { user: venueUser } } = await db.auth.admin.getUserById(req.venue_user_id);
    if (venueUser?.email) {
      const { data: venueRow } = await db
        .from("venue_profiles")
        .select("name")
        .eq("user_id", req.venue_user_id)
        .maybeSingle<{ name: string | null }>();
      const firstName =
        (venueUser.user_metadata?.first_name as string | undefined) ||
        (venueRow?.name || "").split(" ")[0] ||
        "there";
      const artistName = artist.name?.trim() || "An artist";
      await sendEmail({
        idempotencyKey: `artwork_request_response:${inserted.id}:to_venue`,
        template: "venue_brief_response_received",
        category: "placements",
        to: venueUser.email,
        subject: `${artistName} responded to your brief`,
        userId: req.venue_user_id,
        react: VenueBriefResponseReceived({
          firstName,
          artistName,
          requestTitle: req.title,
          responseTypeLabel: RESPONSE_TYPE_LABEL[parsed.data.responseType],
          messagePreview: previewOf(parsed.data.message),
          responsesUrl: `${SITE}/venue-portal/artwork-requests/${encodeURIComponent(id)}`,
        }),
        metadata: { requestId: id, responseId: inserted.id },
      });
    }
  } catch (err) {
    console.warn("[response] venue email skipped:", err);
  }

  return NextResponse.json({ success: true, id: inserted?.id });
}
