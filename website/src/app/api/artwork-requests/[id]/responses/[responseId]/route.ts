// PATCH /api/artwork-requests/[id]/responses/[responseId]
//
// Venue accepts / declines / counters an artist's response. On accept,
// converts the response into the appropriate downstream entity:
//   - response_type='offer'      → creates a purchase_offer (pre-accepted)
//   - response_type='commission' → creates a commission row
//   - response_type='placement'  → creates a pending placements row using
//                                  the artist's proposed terms; venue
//                                  confirms in the placements portal.
//   - response_type='existing_works' / 'message' → just acknowledged

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const patchSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; responseId: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  const { id: requestId, responseId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: req } = await db
    .from("artwork_requests")
    .select("id, venue_user_id, venue_slug, title")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Only the venue can act on responses" }, { status: 403 });
  }

  const { data: resp } = await db
    .from("artwork_request_responses")
    .select("*")
    .eq("id", responseId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (!resp) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  if (resp.status !== "sent") {
    return NextResponse.json({ error: "Response already actioned" }, { status: 409 });
  }

  if (parsed.data.action === "decline") {
    await db
      .from("artwork_request_responses")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", responseId);
    createNotification({
      userId: resp.artist_user_id,
      kind: "artwork_response_declined",
      title: `Response declined`,
      body: `${req.title}: the venue passed on this response.`,
      link: `/artist-portal/artwork-requests`,
    }).catch(() => {});
    return NextResponse.json({ success: true, status: "declined" });
  }

  // Accept — convert into the downstream entity.
  let linkedOfferId: string | null = null;
  let linkedCommissionId: string | null = null;
  let linkedPlacementId: string | null = null;
  let nextStepLink = "";

  if (resp.response_type === "offer" && resp.proposed_offer_amount_pence) {
    // Create a pre-accepted purchase_offer the venue can pay against.
    linkedOfferId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("purchase_offers").insert({
      id: linkedOfferId,
      buyer_user_id: req.venue_user_id,
      buyer_type: "venue",
      buyer_email: auth.user!.email || null,
      artist_user_id: resp.artist_user_id,
      artist_slug: resp.artist_slug,
      work_ids: resp.work_ids || [],
      collection_id: null,
      amount_pence: resp.proposed_offer_amount_pence,
      currency: "GBP",
      message: `Accepted from artwork request "${req.title}"`,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    nextStepLink = `/venue-portal/offers`;
  } else if (resp.response_type === "commission" && resp.proposed_commission_amount_pence) {
    linkedCommissionId = `com_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("commissions").insert({
      id: linkedCommissionId,
      request_id: requestId,
      artist_user_id: resp.artist_user_id,
      artist_slug: resp.artist_slug,
      buyer_user_id: req.venue_user_id,
      buyer_type: "venue",
      title: `Commission for "${req.title}"`,
      description: resp.message,
      amount_pence: resp.proposed_commission_amount_pence,
      currency: "GBP",
      timeline: resp.proposed_commission_timeline,
      status: "accepted",
    });
    nextStepLink = `/venue-portal/commissions`;
  } else if (resp.response_type === "placement") {
    // Plan G2: auto-create a pending placements row using the artist's
    // proposed terms. The venue confirms (or counters) from the
    // placements page rather than re-typing what they just read.
    //
    // Pick the arrangement_type from the proposed terms:
    //   - explicit revenue share > 0 → revenue_share
    //   - monthly fee > 0           → paid_loan
    //   - otherwise                 → free_loan (free display)
    const monthlyFeePence = resp.proposed_monthly_fee_pence as number | null | undefined;
    const revSharePct = resp.proposed_revenue_share_percent as number | null | undefined;
    const arrangementType = (() => {
      if (typeof revSharePct === "number" && revSharePct > 0) return "revenue_share";
      if (typeof monthlyFeePence === "number" && monthlyFeePence > 0) return "paid_loan";
      return "free_loan";
    })();

    // The placements table has `venue TEXT NOT NULL` (see
    // supabase-tables-migration.sql). Without the venue's display
    // name the insert fails with a NOT NULL violation and the auto-
    // create silently falls back to the legacy flow. Fetch the
    // venue profile here so the row validates — mirrors the pattern
    // in /api/placements/route.ts.
    const { data: venueProfile } = await db
      .from("venue_profiles")
      .select("name")
      .eq("user_id", req.venue_user_id)
      .single();

    if (!venueProfile?.name) {
      // Without a venue name we can't satisfy placements.venue NOT
      // NULL. Fall back to the legacy route-the-venue-to-placements
      // flow so the response still flips to "accepted" and the
      // artist still gets their notification.
      console.warn(
        "[artwork-request-accept] missing venue profile for venue_user_id=%s, falling back",
        req.venue_user_id,
      );
      nextStepLink = `/venue-portal/placements?artist=${encodeURIComponent(resp.artist_slug || "")}`;
    } else {
      // placements.id is TEXT — same id-shape the /api/placements POST
      // uses (see src/app/api/placements/route.ts). We mirror it so any
      // analytics that key off id-prefix continue to work.
      const placementId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const monthlyFeeGbp = typeof monthlyFeePence === "number" ? monthlyFeePence / 100 : 0;

      const { error: placementErr } = await db.from("placements").insert({
        id: placementId,
        artist_user_id: resp.artist_user_id,
        artist_slug: resp.artist_slug,
        venue_user_id: req.venue_user_id,
        venue_slug: req.venue_slug,
        venue: venueProfile.name,
        // The placements table requires work_title (NOT NULL in early
        // migrations). When the artist didn't pin specific works we
        // fall back to the brief title so the row still validates; the
        // venue can rename / reassign on the placements page.
        work_title: req.title || "Placement from artwork request",
        work_image: null,
        arrangement_type: arrangementType,
        revenue_share_percent: typeof revSharePct === "number" ? revSharePct : null,
        monthly_fee_gbp: monthlyFeeGbp,
        // QR defaults: rev-share placements need QR (it's how customers buy from
        // the venue's wall); other arrangements default to off if the artist
        // didn't explicitly tick the box. Matches /api/placements POST behaviour.
        qr_enabled: resp.proposed_qr_enabled ?? (arrangementType === "revenue_share"),
        message: `Created from artwork-request response. Original brief: ${req.title ?? ""}`.slice(0, 1000),
        // Both sides have already agreed: artist proposed the terms in
        // the response, venue accepted them here. Skip the "pending"
        // approval step so the placement lands in My Placements as
        // active for both parties.
        status: "active",
        accepted_at: new Date().toISOString(),
        // N3, write side. `requester_user_id` exists in NO migration and not in
        // the live table; the real column is `proposed_by_user_id`. The N3 fix
        // corrected the SELECT that read it and left the three INSERTS that
        // write it, so PostgREST rejected every one of these statements whole
        // and the placement was never created. It is 2 of 86 live rows that
        // carry a proposer, which is what "written by almost nothing" looks
        // like.
        proposed_by_user_id: resp.artist_user_id,
        created_at: new Date().toISOString(),
        notes: null,
      });

      if (placementErr) {
        // Don't block the accept itself — fall back to the old
        // route-the-venue-to-placements flow so the response still
        // moves to "accepted" and the artist gets their notification.
        console.warn("[artwork-request-accept] failed to auto-create placement:", placementErr);
        nextStepLink = `/venue-portal/placements?artist=${encodeURIComponent(resp.artist_slug || "")}`;
      } else {
        linkedPlacementId = placementId;
        // The placement detail page lives at /placements/[id] and infers
        // viewer role internally — there is no /venue-portal/placements/[id]
        // route, so deep-linking there 404s.
        nextStepLink = `/placements/${placementId}`;
      }
    }
  } else {
    // existing_works / message — no downstream entity, just an
    // acknowledged thread.
    nextStepLink = `/venue-portal/messages?artist=${encodeURIComponent(resp.artist_slug || "")}`;
  }

  await db
    .from("artwork_request_responses")
    .update({
      status: "accepted",
      linked_offer_id: linkedOfferId,
      linked_commission_id: linkedCommissionId,
      linked_placement_id: linkedPlacementId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", responseId);

  // If the venue marked their request fulfilled by accepting, surface
  // that — but don't auto-close: a venue may want to keep collecting
  // more responses.

  createNotification({
    userId: resp.artist_user_id,
    kind: "artwork_response_accepted",
    title: `Response accepted`,
    body: `${req.title}: the venue accepted your response. Tap to continue.`,
    link: linkedOfferId
      ? `/artist-portal/offers`
      : linkedCommissionId
        ? `/artist-portal/commissions`
        : linkedPlacementId
          ? `/artist-portal/placements`
          : `/artist-portal/messages`,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    status: "accepted",
    linkedOfferId,
    linkedCommissionId,
    linkedPlacementId,
    nextStepLink,
  });
}
