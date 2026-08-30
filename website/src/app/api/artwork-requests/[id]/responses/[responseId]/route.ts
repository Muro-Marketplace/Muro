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
import { isFlagOn } from "@/lib/feature-flags";
import { isSubscribed } from "@/lib/subscriptions";
import { sendEmail } from "@/lib/email/send";
import { ArtistArtworkResponseAccepted } from "@/emails/templates/artwork-requests/ArtistArtworkResponseAccepted";
import { ArtistArtworkResponseDeclined } from "@/emails/templates/artwork-requests/ArtistArtworkResponseDeclined";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

const patchSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

/**
 * T9 (8.1). The venue's collection point, composed from its profile at the
 * moment the placement is accepted, so the buyer's confirmation shows the
 * address the deal was struck under even if the venue later moves.
 *
 * F47: /api/placements PATCH and the messages placement_response path both stamp
 * this at accept; this route minted an active placement without it, so a work
 * placed through an artwork request had no collection address and the checkout
 * silently fell back to whatever the venue's profile said months later.
 * Deliberately a copy of the placements route's private helper rather than an
 * import: that file is large and concurrently owned, and this is six lines.
 */
async function collectionAddressForVenue(
  db: ReturnType<typeof getSupabaseAdmin>,
  venueSlug: string | null | undefined,
): Promise<string | null> {
  if (!venueSlug) return null;
  const { data } = await db
    .from("venue_profiles")
    .select("name, address_line1, address_line2, city, postcode")
    .eq("slug", venueSlug)
    .maybeSingle<{ name: string | null; address_line1: string | null; address_line2: string | null; city: string | null; postcode: string | null }>();
  if (!data) return null;
  const parts = [data.name, data.address_line1, data.address_line2, data.city, data.postcode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** One canonical dm thread per pair of slugs, matching every other flow. */
function deterministicConversationId(slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `dm-${a}__${b}`;
}

interface FanOutArgs {
  db: ReturnType<typeof getSupabaseAdmin>;
  accepted: boolean;
  artistUserId: string;
  artistSlug: string | null;
  venueUserId: string;
  venueSlug: string | null;
  requestId: string;
  responseId: string;
  requestTitle: string;
  /** What the acceptance produced, for the email's next-step line. */
  outcome: "placement" | "offer" | "commission" | "message";
  /** Relative path the artist should land on, e.g. /artist-portal/placements. */
  artistLink: string;
}

/**
 * F48. Accept and decline were bell-only. Every neighbouring flow (the
 * placements PATCH, the offers PATCH) mirrors each state change into the dm
 * thread AND emails the other party, so an artist who lives in their inbox
 * rather than the portal could sit on an accepted response for weeks without
 * ever learning the venue had said yes.
 *
 * Best-effort on both legs, exactly like the offers route: a flaky mail service
 * or a missing profile must not fail an accept that has already been committed
 * to the database.
 */
async function fanOutResponseDecision(args: FanOutArgs): Promise<void> {
  const { db, accepted, artistUserId, artistSlug, venueUserId, venueSlug, requestTitle } = args;

  const [{ data: artistRow }, { data: venueRow }] = await Promise.all([
    db.from("artist_profiles").select("slug, name").eq("user_id", artistUserId).maybeSingle<{ slug: string | null; name: string | null }>(),
    db.from("venue_profiles").select("slug, name").eq("user_id", venueUserId).maybeSingle<{ slug: string | null; name: string | null }>(),
  ]);
  const resolvedArtistSlug = artistRow?.slug || artistSlug;
  const resolvedVenueSlug = venueRow?.slug || venueSlug;
  const venueName = venueRow?.name || "The venue";

  // Thread message, so the decision reads as part of the same conversation the
  // two of them are already having rather than an isolated bell.
  if (resolvedArtistSlug && resolvedVenueSlug) {
    try {
      const conversationId = deterministicConversationId(resolvedArtistSlug, resolvedVenueSlug);
      await db.from("messages").insert({
        conversation_id: conversationId,
        sender_id: venueUserId,
        sender_name: resolvedVenueSlug,
        sender_type: "venue",
        recipient_slug: resolvedArtistSlug,
        recipient_user_id: artistUserId,
        content: accepted
          ? `Accepted your response to "${requestTitle}".`
          : `Passed on your response to "${requestTitle}".`,
        is_read: false,
        created_at: new Date().toISOString(),
        message_type: "artwork_response_status",
        metadata: {
          requestId: args.requestId,
          responseId: args.responseId,
          responseStatus: accepted ? "accepted" : "declined",
          outcome: args.outcome,
        },
      });
    } catch (err) {
      console.warn("[artwork-request-response] thread message skipped:", err);
    }
  }

  // Email.
  try {
    const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistUserId);
    if (!artistUser?.email) return;
    const firstName =
      (artistUser.user_metadata?.first_name as string | undefined) ||
      (artistRow?.name || "").split(" ")[0] ||
      "there";
    if (accepted) {
      await sendEmail({
        idempotencyKey: `artwork_response_accepted:${args.responseId}`,
        template: "artist_artwork_response_accepted",
        category: "placements",
        to: artistUser.email,
        subject: `${venueName} accepted your response`,
        userId: artistUserId,
        react: ArtistArtworkResponseAccepted({
          firstName,
          venueName,
          requestTitle,
          outcome: args.outcome,
          nextStepUrl: `${SITE}${args.artistLink}`,
        }),
        metadata: { requestId: args.requestId, responseId: args.responseId },
      });
    } else {
      await sendEmail({
        idempotencyKey: `artwork_response_declined:${args.responseId}`,
        template: "artist_artwork_response_declined",
        category: "placements",
        to: artistUser.email,
        subject: `${venueName} passed on your response`,
        userId: artistUserId,
        react: ArtistArtworkResponseDeclined({
          firstName,
          venueName,
          requestTitle,
          browseRequestsUrl: `${SITE}/artist-portal/artwork-requests`,
        }),
        metadata: { requestId: args.requestId, responseId: args.responseId },
      });
    }
  } catch (err) {
    console.warn("[artwork-request-response] email skipped:", err);
  }
}

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

  // F47. Accepting a placement response mints a placements row at status
  // "active" straight away, which is the same commitment /api/placements PATCH
  // gates before it will make one. That route refuses to activate for an artist
  // whose application is still under review, and (behind GATING_V1) for one
  // without a live subscription. This route applied neither, so a venue
  // accepting a brief response was a second, ungated path to exactly the state
  // the PATCH protects.
  //
  // Scoped to the placement branch: offer, commission and message acceptances
  // create no placement and are not what those gates are about. The gates read
  // the ARTIST's state, not the acting venue's, because the artist is the party
  // being committed.
  if (parsed.data.action === "accept" && resp.response_type === "placement") {
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("review_status")
      .eq("user_id", resp.artist_user_id)
      .maybeSingle<{ review_status: string | null }>();
    if (artistProfile?.review_status === "pending") {
      return NextResponse.json(
        {
          error: "artist_application_pending",
          message:
            "This artist's application is still under review, so the placement can't go live yet. You'll be able to accept once we've approved their profile.",
        },
        { status: 403 },
      );
    }
    if (isFlagOn("GATING_V1")) {
      const sub = await isSubscribed(resp.artist_user_id);
      if (!sub.active) {
        return NextResponse.json(
          {
            error: "subscription_required",
            message:
              "This artist doesn't have an active Wallplace subscription, so the placement can't go live yet.",
          },
          { status: 402 },
        );
      }
    }
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
    // F48: the bell was the ONLY signal. Mirror the decision into the thread
    // and the artist's inbox, as the placements and offers flows do.
    await fanOutResponseDecision({
      db,
      accepted: false,
      artistUserId: resp.artist_user_id,
      artistSlug: resp.artist_slug ?? null,
      venueUserId: req.venue_user_id,
      venueSlug: req.venue_slug ?? null,
      requestId: requestId,
      responseId,
      requestTitle: req.title ?? "your brief",
      outcome: "message",
      artistLink: "/artist-portal/artwork-requests",
    });
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
    // E24: /venue-portal/commissions does not exist as a route, so
    // navigating there landed the venue on a 404 straight after a
    // successful accept. Point back at the request detail page, which
    // the detail UI treats as "stay here and show a success state".
    nextStepLink = `/venue-portal/artwork-requests/${requestId}`;
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
      // F47 / T9: stamp the venue's collection point at accept, the same as the
      // placements PATCH and the messages placement_response path. Best-effort:
      // a venue with no address recorded leaves it null and checkout falls back
      // to the live profile.
      const collectionAddress = await collectionAddressForVenue(db, req.venue_slug ?? null);
      // F47: work_title fell back to the brief title even when the artist had
      // pinned specific works, so an accepted placement was named after the
      // venue's request rather than the piece going on the wall. Use the first
      // pinned work's real title when there is one.
      const firstWorkId = (resp.work_ids as string[] | null | undefined)?.[0];
      const { data: firstWork } = firstWorkId
        ? await db.from("artist_works").select("title, image").eq("id", firstWorkId).maybeSingle<{ title: string | null; image: string | null }>()
        : { data: null };

      const { error: placementErr } = await db.from("placements").insert({
        id: placementId,
        artist_user_id: resp.artist_user_id,
        artist_slug: resp.artist_slug,
        venue_user_id: req.venue_user_id,
        venue_slug: req.venue_slug,
        venue: venueProfile.name,
        // The placements table requires work_title (NOT NULL in early
        // migrations). F47: prefer the pinned work's own title, and only fall
        // back to the brief title when the artist named no works at all.
        work_title: firstWork?.title || req.title || "Placement from artwork request",
        work_image: firstWork?.image ?? null,
        collection_address: collectionAddress,
        arrangement_type: arrangementType,
        // E23: proposed_revenue_share_percent is the VENUE'S share (the
        // artist respond form caps it at "max 50% to the venue"), which is
        // exactly what placements.revenue_share_percent means (payout legs
        // deduct it from the artist's gross as venueCutPence). Pass it
        // through unchanged — no inversion.
        revenue_share_percent: typeof revSharePct === "number" ? revSharePct : null,
        monthly_fee_gbp: monthlyFeeGbp,
        // F44. This was `resp.proposed_qr_enabled ?? (arrangementType ===
        // "revenue_share")`, and `??` only covers null: an explicit false on a
        // response carrying a share above zero went straight through, creating a
        // revenue_share placement with qr_enabled false. Those terms contradict
        // each other, the venue is owed a cut of QR sales on a wall with no QR
        // code, so the cut can never be earned. The submit schema now rejects the
        // pairing, and this forces QR on for a revenue share regardless, because
        // rows written before that validation existed still flow through here.
        // Other arrangements keep the old "off unless the artist ticked it".
        qr_enabled: arrangementType === "revenue_share"
          ? true
          : (resp.proposed_qr_enabled ?? false),
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
        // Immutable creator stamp (migration 122). The ACTING user is the
        // venue (both routes assert req.venue_user_id === auth.user.id), and
        // that is deliberate: the artist's outreach unit was already spent on
        // the artwork-request response that produced this placement, so
        // stamping the artist here would charge them for it twice.
        created_by_user_id: auth.user!.id,
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

  // E24: /artist-portal/commissions does not exist, so a commission accept
  // sends the artist to their artwork-requests list, where the accepted
  // response lives — the same target the decline notification uses.
  const artistLink = linkedOfferId
    ? `/artist-portal/offers`
    : linkedCommissionId
      ? `/artist-portal/artwork-requests`
      : linkedPlacementId
        ? `/artist-portal/placements`
        : `/artist-portal/messages`;

  createNotification({
    userId: resp.artist_user_id,
    kind: "artwork_response_accepted",
    title: `Response accepted`,
    body: `${req.title}: the venue accepted your response. Tap to continue.`,
    link: artistLink,
  }).catch(() => {});

  // F48: the bell was the ONLY signal on this branch too, so an artist who
  // lives in their inbox could sit on an accepted response indefinitely.
  await fanOutResponseDecision({
    db,
    accepted: true,
    artistUserId: resp.artist_user_id,
    artistSlug: resp.artist_slug ?? null,
    venueUserId: req.venue_user_id,
    venueSlug: req.venue_slug ?? null,
    requestId,
    responseId,
    requestTitle: req.title ?? "your brief",
    outcome: linkedOfferId
      ? "offer"
      : linkedCommissionId
        ? "commission"
        : linkedPlacementId
          ? "placement"
          : "message",
    artistLink,
  });

  return NextResponse.json({
    success: true,
    status: "accepted",
    linkedOfferId,
    linkedCommissionId,
    linkedPlacementId,
    nextStepLink,
  });
}
