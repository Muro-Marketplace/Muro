// Phase 2.9 D3. "Mark fulfilled" workflow on an accepted artist
// response. Behaviour depends on response_type:
//
//   offer | commission → create an order (or use the linked offer)
//                       → navigate to the order detail page
//   placement          → linked_placement_id already exists from the
//                       accept handler; flip status to fulfilled and
//                       navigate to that placement
//   existing_works     → caller picks action="place" or "buy" via the
//                       2-button modal on the venue UI
//   message            → no fulfilment artifact, just flip the
//                       request status to fulfilled

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const fulfillSchema = z.object({
  response_id: z.string().uuid(),
  /** Required for response_type='existing_works' (caller picks). For
   *  other types the response_type drives the action and this can be
   *  omitted. */
  action: z.enum(["order", "placement"]).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id: requestId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = fulfillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: req } = await db
    .from("artwork_requests")
    .select("id, venue_user_id, status, title")
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      venue_user_id: string;
      status: string;
      title: string;
    }>();
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data: resp } = await db
    .from("artwork_request_responses")
    .select(
      "id, request_id, response_type, status, artist_user_id, artist_slug, work_ids, proposed_offer_amount_pence, proposed_commission_amount_pence, proposed_monthly_fee_pence, proposed_revenue_share_percent, proposed_qr_enabled, linked_placement_id, linked_offer_id, linked_commission_id",
    )
    .eq("id", parsed.data.response_id)
    .eq("request_id", requestId)
    .maybeSingle<{
      id: string;
      request_id: string;
      response_type: string;
      status: string;
      artist_user_id: string;
      artist_slug: string | null;
      work_ids: string[] | null;
      proposed_offer_amount_pence: number | null;
      proposed_commission_amount_pence: number | null;
      proposed_monthly_fee_pence: number | null;
      proposed_revenue_share_percent: number | null;
      proposed_qr_enabled: boolean | null;
      linked_placement_id: string | null;
      linked_offer_id: string | null;
      linked_commission_id: string | null;
    }>();

  if (!resp) {
    return NextResponse.json({ error: "Response not found" }, { status: 404 });
  }
  if (resp.status !== "accepted") {
    return NextResponse.json(
      { error: "Only accepted responses can be fulfilled" },
      { status: 422 },
    );
  }

  let routeTo: string | null = null;

  const type = resp.response_type;
  if (type === "offer" || type === "commission") {
    routeTo = resp.linked_offer_id
      ? `/venue-portal/offers`
      : `/venue-portal/orders`;
  } else if (type === "placement") {
    routeTo = resp.linked_placement_id
      ? `/placements/${resp.linked_placement_id}`
      : `/venue-portal/placements`;
  } else if (type === "existing_works") {
    if (!parsed.data.action) {
      return NextResponse.json(
        { error: "action ('order' or 'placement') is required for existing_works responses" },
        { status: 400 },
      );
    }
    if (parsed.data.action === "placement") {
      const placementId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("name, slug")
        .eq("user_id", req.venue_user_id)
        .maybeSingle<{ name: string | null; slug: string | null }>();
      const firstWork = (resp.work_ids ?? [])[0];
      const monthlyFeeGbp = typeof resp.proposed_monthly_fee_pence === "number"
        ? resp.proposed_monthly_fee_pence / 100
        : 0;
      await db.from("placements").insert({
        id: placementId,
        artist_user_id: resp.artist_user_id,
        artist_slug: resp.artist_slug,
        venue_user_id: req.venue_user_id,
        venue_slug: venueProfile?.slug ?? null,
        venue: venueProfile?.name ?? "Venue",
        work_title: firstWork ?? req.title,
        arrangement_type: monthlyFeeGbp > 0 ? "paid_loan" : "free_loan",
        monthly_fee_gbp: monthlyFeeGbp,
        revenue_share_percent: resp.proposed_revenue_share_percent ?? null,
        qr_enabled: resp.proposed_qr_enabled ?? false,
        status: "pending",
        requester_user_id: req.venue_user_id,
      });
      await db
        .from("artwork_request_responses")
        .update({ linked_placement_id: placementId })
        .eq("id", resp.id);
      routeTo = `/placements/${placementId}`;
    } else {
      // action === "order". Create a pre-accepted purchase_offer so the
      // venue can pay against it — same shape the accept handler uses
      // for 'offer'.
      const offerId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.from("purchase_offers").insert({
        id: offerId,
        buyer_user_id: req.venue_user_id,
        buyer_type: "venue",
        buyer_email: auth.user!.email || null,
        artist_user_id: resp.artist_user_id,
        artist_slug: resp.artist_slug,
        work_ids: resp.work_ids || [],
        amount_pence:
          resp.proposed_offer_amount_pence ??
          resp.proposed_commission_amount_pence ??
          0,
        currency: "GBP",
        message: `Existing-works purchase from artwork request "${req.title}"`,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      });
      await db
        .from("artwork_request_responses")
        .update({ linked_offer_id: offerId })
        .eq("id", resp.id);
      routeTo = `/venue-portal/offers`;
    }
  } else if (type === "message") {
    routeTo = `/venue-portal/artwork-requests/${requestId}`;
  } else {
    return NextResponse.json({ error: "Unknown response_type" }, { status: 400 });
  }

  // Flip request status to fulfilled across the board.
  await db
    .from("artwork_requests")
    .update({ status: "fulfilled" })
    .eq("id", requestId);

  return NextResponse.json({ status: "ok", route_to: routeTo });
}
