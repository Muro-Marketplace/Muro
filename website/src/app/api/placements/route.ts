import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canPlacementTransition } from "@/lib/placements/state-machine";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { handleAuthzError } from "@/lib/authz";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import { cancelPaidLoanBilling } from "@/lib/placements/paid-loan-billing";
import { deriveArrangementType } from "@/lib/placements/arrangement";
import { isFlagOn } from "@/lib/feature-flags";
import { isSubscribed } from "@/lib/subscriptions";
import { placementSchema, placementUpdateSchema } from "@/lib/validations";
import { checkArtistOutreachCap } from "@/lib/outreach-cap";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { VenueNewPlacementRequest } from "@/emails/templates/placements/VenueNewPlacementRequest";
import { ArtistPlacementAccepted } from "@/emails/templates/placements/ArtistPlacementAccepted";
import { ArtistPlacementDeclined } from "@/emails/templates/placements/ArtistPlacementDeclined";
import { ArtistPlacementRequestSent } from "@/emails/templates/placements/ArtistPlacementRequestSent";
import { VenuePlacementAcceptedConfirmation } from "@/emails/templates/placements/VenuePlacementAcceptedConfirmation";
import { PlacementVenueDeclinedArtistRequest } from "@/emails/templates/placements/PlacementVenueDeclinedArtistRequest";
import { PlacementCancelled } from "@/emails/templates/placements/PlacementCancelled";
import { PlacementCounterOfferReceived } from "@/emails/templates/placements/PlacementCounterOfferReceived";
import { PlacementScheduled } from "@/emails/templates/placements/PlacementScheduled";
import { PlacementArtworkInstalled } from "@/emails/templates/placements/PlacementArtworkInstalled";
import { PlacementEnded } from "@/emails/templates/placements/PlacementEnded";
import { z } from "zod";
import { ArtistNewPlacementInvitation } from "@/emails/templates/placements/ArtistNewPlacementInvitation";
import { placementTermsSummary } from "@/lib/placements/terms-summary";
import { labelForArrangement } from "@/lib/arrangement-labels";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// Every handler on this route must read live DB state, not a cached Route
// Handler response. Without this, Next.js was serving a stale GET response
// after a DELETE so the deleted placement reappeared on refresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// One canonical conversation per pair of parties. Historically the
// placement flow created its own `placement-…` thread, which meant an
// artist and venue could end up with TWO chats (a regular DM thread
// and the placement thread) and never realise the other existed. We
// now unify everything into the `dm-…` thread so every message, DMs,
// placement requests, counters, responses, lives in one place.
function deterministicConversationId(slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `dm-${a}__${b}`;
}

/**
 * Determine if the authenticated user is an artist or venue.
 * Returns { type, slug, profile } or null.
 */
async function getUserRole(userId: string) {
  const db = getSupabaseAdmin();
  const { data: artist } = await db
    .from("artist_profiles")
    .select("slug, name, user_id")
    .eq("user_id", userId)
    .single();
  if (artist) return { type: "artist" as const, slug: artist.slug, name: artist.name };

  const { data: venue } = await db
    .from("venue_profiles")
    .select("slug, name, user_id")
    .eq("user_id", userId)
    .single();
  if (venue) return { type: "venue" as const, slug: venue.slug, name: venue.name };

  return null;
}

// GET: fetch placements for the authenticated user (artist or venue)
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const role = await getUserRole(auth.user!.id);

    if (!role) {
      return NextResponse.json({ placements: [] });
    }

    let query;
    if (role.type === "artist") {
      query = db.from("placements").select("*").eq("artist_user_id", auth.user!.id);
    } else {
      query = db.from("placements").select("*").eq("venue_user_id", auth.user!.id);
    }

    // ?engaged=true used to drop pending venue-initiated requests the
    // artist hadn't opened yet, the idea being that "discovery" lives
    // on /artwork-requests and the portal stays focused on engaged
    // rows. In practice it caused two failure modes: an unarchived
    // pending row never re-appeared on the portal because the filter
    // dropped it server-side, and incoming requests were invisible
    // from the portal even though the same row was listed as Pending
    // in the bell + Messages. The artist portal already has a Pending
    // tab that makes this surface useful as an inbox, so the filter
    // is now a no-op. The query param is kept so callers don't break.

    // Row 22 (D65): the hidden_for_* retry that used to sit here is DELETED.
    // Both columns exist in prod (verified against tests/integration/schema-columns.json),
    // so the fallback could never fire for the reason it claimed; all it could do
    // was re-run the query without the caller's filters and mask a real failure.
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch placements" }, { status: 500 });
    }

    // Pull the caller's archive state. Two sources in order of
    // precedence:
    //   1. The hidden_for_artist / hidden_for_venue flags on the
    //      placements row (migration 026).
    //   2. A fallback `placement_archives` table keyed by
    //      (placement_id, user_id) that the DELETE endpoint writes to
    //      when those columns don't exist yet. Either path means the
    //      row is archived for *this* user, the counterparty is
    //      unaffected.
    const hiddenFlag = role.type === "artist" ? "hidden_for_artist" : "hidden_for_venue";
    const archivedMode = new URL(request.url).searchParams.get("archived") || "";
    const fallbackArchivedIds = new Set<string>();
    try {
      const { data: archRows } = await db
        .from("placement_archives")
        .select("placement_id")
        .eq("user_id", auth.user!.id);
      for (const r of (archRows || []) as Array<{ placement_id: string }>) {
        if (r.placement_id) fallbackArchivedIds.add(r.placement_id);
      }
    } catch { /* table may not exist, treat as empty */ }

    const placements = (data || []).filter((p) => {
      // Source-of-truth precedence:
      //   1. If the placements row has the hidden_for_* column populated
      //      (true or false), trust it. This is the modern path post-026.
      //   2. Only fall back to placement_archives when the column is
      //      undefined on the row (i.e. migration 026 hasn't been applied
      //      on this env yet).
      // Previously these were OR'd together, which meant a stale
      // placement_archives row from an early environment (or an aborted
      // archive) could keep a placement permanently "hidden" even after
      // the user explicitly unarchived it via the column. Symptom: the
      // artist's All tab is empty but every placement sits under
      // Archived with no visible way to recover them.
      const columnValue = (p as Record<string, unknown>)[hiddenFlag];
      const hidden = columnValue === true
        ? true
        : columnValue === false
          ? false
          : (typeof p.id === "string" && fallbackArchivedIds.has(p.id));
      if (archivedMode === "all") return true;
      if (archivedMode === "1" || archivedMode === "true") return hidden;
      return !hidden;
    });

    // Compute realised revenue per placement. For venues we sum
    // `orders.venue_revenue`; for artists we sum `orders.artist_revenue`.
    // Best-effort: if the orders table is missing the columns or nothing
    // links back, we leave earnings as 0.
    const placementIds = placements
      .map((p) => (typeof p.id === "string" ? p.id : null))
      .filter((x): x is string => !!x);

    const earnedByPlacement: Record<string, number> = {};
    if (placementIds.length > 0) {
      const revenueCol = role.type === "venue" ? "venue_revenue" : "artist_revenue";
      const { data: orders } = await db
        .from("orders")
        .select(`placement_id, ${revenueCol}`)
        .in("placement_id", placementIds);
      for (const row of (orders || []) as Array<Record<string, unknown>>) {
        const pid = row.placement_id as string | null;
        const amount = Number(row[revenueCol] ?? 0);
        if (!pid || Number.isNaN(amount)) continue;
        earnedByPlacement[pid] = (earnedByPlacement[pid] || 0) + amount;
      }
    }

    // QR scan counts (item "QR code scan should be live view count").
    // analytics_events stores qr_scan rows with artist_slug, venue_name,
    // work_id. We bucket by (artist_slug + venue_slug + work_title) and
    // attach the count to each placement.
    const qrByPlacement: Record<string, number> = {};
    try {
      const artistSlugs = Array.from(new Set(placements.map((p) => p.artist_slug).filter(Boolean))) as string[];
      const venueSlugs = Array.from(new Set(placements.map((p) => p.venue_slug).filter(Boolean))) as string[];
      if (artistSlugs.length > 0) {
        const { data: events } = await db
          .from("analytics_events")
          .select("artist_slug, venue_name, work_id")
          .eq("event_type", "qr_scan")
          .in("artist_slug", artistSlugs);
        for (const p of placements) {
          if (!p.id || !p.artist_slug) continue;
          const count = (events || []).filter((e: { artist_slug?: string; venue_name?: string; work_id?: string }) => {
            if (e.artist_slug !== p.artist_slug) return false;
            // Venue attribution is best-effort, some older events may
            // not carry venue_name. We count anything matching the artist
            // if venue_slug isn't set, otherwise require venue match.
            if (p.venue_slug && venueSlugs.length > 0 && e.venue_name && e.venue_name !== p.venue_slug) return false;
            // Work-level match when available
            if (p.work_title && e.work_id && e.work_id.toLowerCase() !== String(p.work_title).toLowerCase()) return false;
            return true;
          }).length;
          qrByPlacement[p.id as string] = count;
        }
      }
    } catch { /* leave counts empty if analytics table missing */ }

    // Scan placement_request messages once and derive two things:
    //   1. inferredRequesters, the FIRST sender per placement, used
    //      to backfill legacy rows where proposed_by_user_id is NULL.
    //   2. latestCountererByPlacement, the sender of the MOST RECENT
    //      counter message, which is the authoritative current
    //      requester even if the placements.proposed_by_user_id column
    //      never got flipped. This is what prevents a counter-sender
    //      from accepting their own counter offer, the DB column can
    //      lag behind the message trail, but the messages are the
    //      source of truth for the negotiation.
    const inferredRequesters: Record<string, string> = {};
    const latestCountererByPlacement: Record<string, { userId: string; at: string }> = {};
    if (placementIds.length > 0) {
      const { data: reqMsgs } = await db
        .from("messages")
        .select("sender_id, sender_name, metadata, created_at")
        .eq("message_type", "placement_request")
        .order("created_at", { ascending: true })
        .limit(1000);
      for (const m of (reqMsgs || []) as Array<{ sender_id: string | null; sender_name: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
        const pid = m.metadata?.placementId as string | undefined;
        if (!pid || !placementIds.includes(pid)) continue;
        // First sender is the original requester (when the row's own
        // proposed_by_user_id is missing).
        if (!inferredRequesters[pid] && m.sender_id) {
          inferredRequesters[pid] = m.sender_id;
        }
        // Every counter message stamps metadata.requesterUserId with
        // the counter sender. Track the most recent per placement.
        const isCounter = m.metadata?.counter === true;
        const senderFromMeta = m.metadata?.requesterUserId as string | undefined;
        const sender = senderFromMeta || m.sender_id || null;
        if (isCounter && sender) {
          const existing = latestCountererByPlacement[pid];
          if (!existing || existing.at < m.created_at) {
            latestCountererByPlacement[pid] = { userId: sender, at: m.created_at };
          }
        }
      }
      // Back-fill the column for rows where it's NULL so subsequent
      // reads short-circuit the scan.
      for (const [pid, uid] of Object.entries(inferredRequesters)) {
        const row = placements.find((p) => p.id === pid);
        if (row && !row.proposed_by_user_id) {
          db.from("placements").update({ proposed_by_user_id: uid }).eq("id", pid).then(() => {}, () => {});
        }
      }
    }

    const enriched = placements.map((p) => {
      const pid = p.id as string;
      // Precedence for the "who currently holds the request" field:
      //   1. The latest counter message (source of truth, even if the
      //      DB column didn't flip, the counter sender should not be
      //      able to accept / decline their own counter).
      //   2. The placements.proposed_by_user_id column.
      //   3. The inferred original requester.
      const counterer = pid ? latestCountererByPlacement[pid] : null;
      const resolvedRequester = counterer?.userId
        || p.proposed_by_user_id
        || (pid ? inferredRequesters[pid] : null)
        || null;
      return {
        ...p,
        proposed_by_user_id: resolvedRequester,
        revenue_earned_gbp: pid && earnedByPlacement[pid]
          ? Math.round(earnedByPlacement[pid] * 100) / 100
          : 0,
        qr_scans: pid ? (qrByPlacement[pid] || 0) : 0,
      };
    });

    return NextResponse.json({ placements: enriched, userType: role.type });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[placements] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: artist or venue creates a placement request
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: the demo guard existed but had ZERO call sites, while two doc comments
  // claimed it was wired. This handler reaches real people (real emails, real
  // money, or content on a public page), so it takes the STRICT 403 variant.
  const demoBlocked = assertNotDemoStrict(auth.user!.id);
  if (demoBlocked) return demoBlocked;

  try {
    const body = await request.json();
    const { placements, fromVenue, artistSlug: bodyArtistSlug } = body;

    if (!placements || !Array.isArray(placements) || placements.length === 0) {
      return NextResponse.json({ error: "No placements provided" }, { status: 400 });
    }

    const parsed = z.array(placementSchema).safeParse(placements);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid placement data" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const role = await getUserRole(auth.user!.id);

    // B3 (Phase 2.5, gated by GATING_V1): non-subscribed artists can't
    // send a placement request. Venues are always allowed to initiate
    // — they're the paying customer surface, not the gated one. We
    // gate the artist-initiated branch only.
    if (isFlagOn("GATING_V1") && !fromVenue && role?.type === "artist") {
      const sub = await isSubscribed(auth.user!.id);
      if (!sub.active) {
        return NextResponse.json(
          {
            error: "subscription_required",
            message: "Sending placement requests requires an active Wallplace subscription.",
            upgrade_url: "/artist-portal/billing",
          },
          { status: 402 },
        );
      }
    }

    let artistProfile: { user_id: string; slug: string; name: string } | null = null;
    let venueProfile: { user_id: string; slug: string; name: string } | null = null;

    // A `fromVenue` caller whose role isn't "venue" almost always means
    // their venue_profiles row is missing or unlinked (the registration
    // race: row inserted with user_id=NULL, ensureProfile never ran).
    // Returning the artist-branch's "Artist profile not found" here is
    // actively misleading — the venue user has no idea what an artist
    // profile has to do with their placement request. Surface a venue-
    // specific error instead so the UI can hint at the actual fix
    // (open Venue Profile, complete setup).
    if (fromVenue && role?.type !== "venue") {
      return NextResponse.json(
        {
          error: "Your venue profile isn't set up yet. Open Venue Profile, complete the details, then try again.",
          code: "venue_profile_missing",
        },
        { status: 409 },
      );
    }

    if (fromVenue && role?.type === "venue") {
      // Venue-initiated request: look up artist from body.
      //
      // If the artist isn't in artist_profiles (seed-data-only or hasn't
      // signed up yet), we still accept the placement, it's stored with
      // artist_user_id = NULL and just the slug. When the artist later
      // signs up we can claim it by slug. A venue should be able to
      // request a placement from any artist.
      const targetArtistSlug = bodyArtistSlug || parsed.data[0].venueSlug;
      if (!targetArtistSlug) {
        return NextResponse.json({ error: "Artist selection required" }, { status: 400 });
      }
      const { data: vp } = await db.from("venue_profiles").select("user_id, slug, name").eq("user_id", auth.user!.id).single();
      if (!vp) return NextResponse.json({ error: "Venue profile not found" }, { status: 400 });

      const { data: ap } = await db.from("artist_profiles").select("user_id, slug, name").eq("slug", targetArtistSlug).single();

      // Fallback: synthesize a minimal "artist profile" so the rest of
      // the flow can work. `user_id` stays empty, downstream code
      // checks for it before trying to email / notify.
      artistProfile = ap || {
        user_id: "",
        slug: targetArtistSlug,
        name: (targetArtistSlug as string).split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      };
      venueProfile = vp;
    } else {
      // Artist-initiated request: look up venue from venueSlug.
      // Pending applicants can't send placement requests, admin
      // has to approve their profile first. Mirrors the venue list
      // gate in /api/placements/venues + the accept-gate in PATCH.
      const { data: ap } = await db
        .from("artist_profiles")
        .select("user_id, slug, name, review_status")
        .eq("user_id", auth.user!.id)
        .single();
      if (!ap) return NextResponse.json({ error: "Artist profile not found" }, { status: 400 });
      if ((ap as { review_status?: string }).review_status === "pending") {
        return NextResponse.json(
          {
            error:
              "Your application is still under review. You'll be able to send placement requests once we've approved your profile.",
            reason: "application_pending",
          },
          { status: 403 },
        );
      }

      // Anti-spam outreach cap (#39). Unified across all surfaces: caps
      // NEW venue contacts per calendar day per tier (Core 2, Premium 5,
      // Pro 10) counting placements + first-contact messages +
      // artwork-request responses together. The canonical helper owns the
      // logic; this route no longer maintains its own counter.
      const cap = await checkArtistOutreachCap(db, auth.user!.id, parsed.data.length);
      if (!cap.ok) {
        return NextResponse.json(
          {
            error: "outreach_limit_reached",
            message: cap.result.message,
            limit: cap.result.limit,
            sent: cap.result.used,
            plan: cap.result.plan,
          },
          { status: 429 },
        );
      }

      const venueSlug = parsed.data[0].venueSlug;
      if (!venueSlug) return NextResponse.json({ error: "Venue selection required" }, { status: 400 });

      const { data: vp } = await db.from("venue_profiles").select("user_id, slug, name").eq("slug", venueSlug).single();
      if (!vp) return NextResponse.json({ error: "Venue not found" }, { status: 400 });

      artistProfile = ap;
      venueProfile = vp;
    }

    if (artistProfile.user_id && artistProfile.user_id === venueProfile.user_id) {
      return NextResponse.json(
        { error: "You cannot create a placement between your own artist and venue profiles" },
        { status: 400 }
      );
    }

    // Full row with every column the app understands. There is no fallback
    // chain any more (row 22): every column here exists in prod, so a failed
    // insert is a real error and is surfaced as one.
    const fullRows = parsed.data.map((p) => ({
      id: p.id,
      artist_user_id: artistProfile!.user_id || null,
      artist_slug: artistProfile!.slug,
      venue_user_id: venueProfile!.user_id,
      venue_slug: venueProfile!.slug,
      work_title: p.workTitle,
      work_image: p.workImage || null,
      // Size requested for the primary work (migration 032).
      work_size: p.requestedDimensions || null,
      // Additional works sharing the same placement row, saved into
      // extra_works (migration 027).
      extra_works: Array.isArray(p.extraWorks) && p.extraWorks.length > 0
        ? p.extraWorks.map((w) => ({ title: w.title, image: w.image || null, size: w.size || null }))
        : null,
      venue: venueProfile!.name,
      // Phase 2.0e (G3 prereq): write the derived arrangement_type at
      // the source so downstream label / billing reads agree with the
      // economics (paid_loan + qr_enabled → mixed, etc.). Existing
      // request still passes p.type so legacy clients work; we just
      // canonicalise it here.
      arrangement_type: deriveArrangementType({
        monthly_fee_gbp: p.monthlyFeeGbp ?? null,
        qr_enabled: p.qrEnabled ?? true,
        revenue_share_percent: p.revenueSharePercent ?? null,
        purchase_amount_pence:
          p.type === "purchase" ? 1 : null,
      }),
      revenue_share_percent: p.revenueSharePercent || null,
      monthly_fee_gbp: p.monthlyFeeGbp ?? null,
      qr_enabled: p.qrEnabled ?? true,
      message: p.message || null,
      status: "pending",
      revenue: null,
      notes: p.notes || null,
      proposed_by_user_id: auth.user!.id,
      created_at: new Date().toISOString(),
    }));

    // Row 22 (D65): the strip-and-retry loop that used to sit here is DELETED.
    // All eight candidate columns (proposed_by_user_id, venue_slug, artist_slug,
    // monthly_fee_gbp, qr_enabled, message, extra_works, work_size) exist in prod,
    // so a rejected insert is never "the column is missing" — it is a real failure,
    // and re-inserting without the payment terms silently created a placement whose
    // agreed fee and QR setting were gone while the caller got a 200.
    const { error } = await db.from("placements").insert(fullRows);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: `Failed to save placements: ${error.message || "unknown DB error"}` },
        { status: 500 },
      );
    }

    // Notify the other party by email (fire-and-forget)
    const notifyUserId = fromVenue ? artistProfile!.user_id : venueProfile!.user_id;
    if (notifyUserId) {
      const { data: { user: notifyUser } } = await db.auth.admin.getUserById(notifyUserId);
      if (notifyUser?.email) {
        const placementIdForLink = parsed.data[0]?.id;
        // Build an arrangement-summary string the shared template expects.
        // K1: was an inline IIFE, duplicated verbatim below and worded a third
        // way inside the legacy notifyPlacementRequest.
        const termsSummary = placementTermsSummary(
          parsed.data[0].type,
          parsed.data[0].revenueSharePercent,
          parsed.data[0].monthlyFeeGbp,
        );
        const placementUrl = placementIdForLink
          ? `${SITE}/placements/${encodeURIComponent(placementIdForLink)}`
          : `${SITE}/${fromVenue ? "artist-portal" : "venue-portal"}/placements`;

        // Both directions of one event go through the same pipeline now (K1).
        // The venue-initiated half used to fall back to a hand-written legacy
        // helper "because we don't yet have a matching polished template", so
        // half the recipients of this event got mail with no suppression check,
        // no preference check and no record it was attempted.
        if (!fromVenue) {
          await sendEmail({
            idempotencyKey: `placement_request:${placementIdForLink}:to_venue`,
            template: "venue_new_placement_request",
            category: "placements",
            to: notifyUser.email,
            subject: `New placement request from ${artistProfile!.name}`,
            userId: notifyUserId,
            react: VenueNewPlacementRequest({
              firstName: notifyUser.user_metadata?.first_name || venueProfile!.name.split(" ")[0] || "there",
              venueName: venueProfile!.name,
              artist: {
                id: artistProfile!.user_id || "",
                name: artistProfile!.name,
                slug: artistProfile!.slug,
                avatar: `${SITE}/avatars/${artistProfile!.slug}.jpg`,
                location: "",
                primaryMedium: "",
                url: `${SITE}/browse/${artistProfile!.slug}`,
              },
              artistProfileUrl: `${SITE}/browse/${artistProfile!.slug}`,
              placementUrl,
              requestedWorks: parsed.data.map((p) => p.workTitle),
              proposedTerms: termsSummary,
              message: parsed.data[0].message || undefined,
            }),
            metadata: { placementId: placementIdForLink, arrangementType: parsed.data[0].type },
          });
        } else {
          await sendEmail({
            idempotencyKey: `placement_request:${placementIdForLink}:to_artist`,
            template: "artist_new_placement_invitation",
            category: "placements",
            to: notifyUser.email,
            subject: `${venueProfile!.name} would like to display your work`,
            userId: notifyUserId,
            react: ArtistNewPlacementInvitation({
              firstName:
                notifyUser.user_metadata?.first_name || artistProfile!.name.split(" ")[0] || "there",
              venue: {
                id: venueProfile!.user_id || "",
                name: venueProfile!.name,
                slug: venueProfile!.slug,
                image: "",
                location: "",
                type: "",
                url: `${SITE}/venues/${venueProfile!.slug}`,
              },
              placementUrl,
              requestedWorks: parsed.data.map((p) => p.workTitle),
              proposedTerms: termsSummary,
              message: parsed.data[0].message || undefined,
            }),
            metadata: { placementId: placementIdForLink, arrangementType: parsed.data[0].type },
          });
        }
      }

      // Receipt to the requester themselves, closes the "did it go
      // through?" loop. Only wired for artist-initiated requests today;
      // the venue-initiated flow falls back to the legacy notify and we
      // can wire VenuePlacementRequestSent if/when one's added. Sent
      // fire-and-forget so a flaky email service can't fail the
      // placement create itself.
      if (!fromVenue && auth.user?.email) {
        const senderEmail = auth.user.email;
        const senderUserId = auth.user.id;
        const senderFirstName =
          (auth.user.user_metadata?.first_name as string | undefined) ||
          artistProfile!.name.split(" ")[0] ||
          "there";
        const placementIdForLink = parsed.data[0]?.id;
        const placementUrl = placementIdForLink
          ? `${SITE}/placements/${encodeURIComponent(placementIdForLink)}`
          : `${SITE}/artist-portal/placements`;
        // K1: was an inline IIFE, duplicated verbatim below and worded a third
        // way inside the legacy notifyPlacementRequest.
        const termsSummary = placementTermsSummary(
          parsed.data[0].type,
          parsed.data[0].revenueSharePercent,
          parsed.data[0].monthlyFeeGbp,
        );
        sendEmail({
          idempotencyKey: `placement_request:${placementIdForLink}:to_artist`,
          template: "artist_placement_request_sent",
          category: "placements",
          to: senderEmail,
          subject: `Request sent to ${venueProfile!.name}`,
          userId: senderUserId,
          react: ArtistPlacementRequestSent({
            firstName: senderFirstName,
            venueName: venueProfile!.name,
            placementUrl,
            requestedWorks: parsed.data.map((p) => p.workTitle),
            proposedTerms: termsSummary,
          }),
          metadata: { placementId: placementIdForLink },
        }).catch((err) => {
          if (err) console.error("Artist receipt email failed:", err);
        });
      }

      // In-app notification (F9)
      const portalBase = fromVenue ? "/artist-portal" : "/venue-portal";
      const workTitles = parsed.data.map((p) => p.workTitle);
      const workSummary = workTitles.length === 1
        ? workTitles[0]
        : `${workTitles.length} works`;
      const requesterName = fromVenue ? venueProfile!.name : artistProfile!.name;
      // Deep-link to the full placement page. If we're creating a batch
      // (multiple placements from one request), link to the list since
      // there's no single id to point at.
      const firstPlacementId = parsed.data[0]?.id;
      const link = parsed.data.length === 1 && firstPlacementId
        ? `/placements/${encodeURIComponent(firstPlacementId)}`
        : `${portalBase}/placements`;
      createNotification({
        userId: notifyUserId,
        kind: "placement_request",
        title: "New placement request",
        body: `${requesterName} requested a placement for ${workSummary}`,
        link,
      }).catch(() => {});
    }

    // Auto in-app message from requester to recipient (F7)
    try {
      const requesterSlug = fromVenue ? venueProfile!.slug : artistProfile!.slug;
      const recipientSlug = fromVenue ? artistProfile!.slug : venueProfile!.slug;
      const senderType = fromVenue ? "venue" : "artist";
      const workTitles = parsed.data.map((p) => p.workTitle);
      const workLine = workTitles.length === 1
        ? workTitles[0]
        : workTitles.join(", ");
      // Message content is just the sender's optional note. The work
      // title and arrangement are already rendered as a card in the
      // thread, so repeating them here duplicates the info.
      const userMessage = (parsed.data[0].message || "").trim();
      const content = userMessage || "";

      // Prefer an existing conversation between these two parties so the
      // request lands in the same chat the user is already having.
      const { data: existingConv } = await db
        .from("messages")
        .select("conversation_id")
        .or(
          `and(sender_name.eq.${requesterSlug},recipient_slug.eq.${recipientSlug}),and(sender_name.eq.${recipientSlug},recipient_slug.eq.${requesterSlug})`,
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cid = existingConv?.conversation_id
        || deterministicConversationId(requesterSlug, recipientSlug);

      // Link the message back to the placement so the UI can render inline
      // Accept/Decline buttons in the messages thread (F25).
      const placementIds = parsed.data.map((p) => p.id);
      // recipient_user_id is nullable, when the artist hasn't signed up
      // yet, we carry the message by slug alone and claim it later.
      const recipientUserId = fromVenue ? artistProfile!.user_id : venueProfile!.user_id;
      const baseMsg = {
        conversation_id: cid,
        sender_id: auth.user!.id,
        sender_name: requesterSlug,
        sender_type: senderType,
        recipient_slug: recipientSlug,
        recipient_user_id: recipientUserId || null,
        content,
        is_read: false,
        created_at: new Date().toISOString(),
      };
      const firstPlacementId = placementIds[0] || null;
      const firstWorkImage = parsed.data[0].workImage || null;
      const extendedMsg = {
        ...baseMsg,
        message_type: "placement_request",
        metadata: {
          // Match the shape MessageInbox already understands
          placementId: firstPlacementId,
          workTitle: workLine,
          workImage: firstWorkImage,
          workTitles,
          arrangementType: parsed.data[0].type,
          revenueSharePercent: parsed.data[0].revenueSharePercent || null,
          qrEnabled: parsed.data[0].qrEnabled ?? true,
          monthlyFeeGbp: parsed.data[0].monthlyFeeGbp ?? null,
          placementIds,
          // Gate Accept/Decline on this explicitly. The requester must
          // never see the response controls on their own request, even
          // if sender_id is stripped or mismatched.
          requesterUserId: auth.user!.id,
        },
      };

      // Row 22 (D65): the "retry without message_type/metadata" fallback is DELETED.
      // Both columns exist in prod, and the metadata is what gates the recipient's
      // Accept/Decline controls — re-inserting without it produced a message that
      // looked delivered but could not be acted on.
      const { error: msgErr } = await db.from("messages").insert(extendedMsg);
      if (msgErr) {
        console.warn("Auto-message on placement skipped:", msgErr.message);
      }
    } catch (err) {
      console.warn("Auto-message on placement skipped:", err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[placements] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update placement status (artist or venue)
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: the demo guard existed but had ZERO call sites, while two doc comments
  // claimed it was wired. This handler reaches real people (real emails, real
  // money, or content on a public page), so it takes the STRICT 403 variant.
  const demoBlocked = assertNotDemoStrict(auth.user!.id);
  if (demoBlocked) return demoBlocked;

  try {
    const body = await request.json();
    const parsed = placementUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "ID and valid status required" }, { status: 400 });
    }

    const { id, status, stage, counter, stageDate, unsetStage } = parsed.data;
    if (!status && !stage && !counter && !unsetStage) {
      return NextResponse.json({ error: "status, stage, counter, or unsetStage required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Fetch the placement. 7c: proposed_by_user_id is a real column, so the
    // select succeeds; the old "retry without the column" fallback that this
    // relied on (the phantom requester_user_id rejected the whole query) is gone.
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id, venue_user_id, artist_slug, venue_slug, venue, status, proposed_by_user_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    const isArtist = existing.artist_user_id === auth.user!.id;
    const isVenue = existing.venue_user_id === auth.user!.id;

    if (!isArtist && !isVenue) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    // E20. Every caller-supplied status write goes through the state machine.
    // Without it, `existing.status` was consulted only for two same-state
    // no-ops, so declined/cancelled/completed → active all fell through to the
    // unconditional `updates.status = status` below. A party who had been
    // REJECTED could force their own deal live, and because every downstream
    // hook keys on `pending → active`, the row went active with no Stripe
    // subscription, no inventory decrement and no accepted_at.
    //
    // Scoped to the `status` body field on purpose. The stage path
    // (stage="collected" → completed) and the undo path (unsetStage="collected"
    // → active) write updates.status directly and are server-chosen, not
    // caller-asserted, so they legitimately bypass this gate. Verified in the
    // source rather than assumed, because completed has no outgoing transition
    // and gating the undo would have broken it.
    if (status) {
      const transition = canPlacementTransition(existing.status, status);
      if (!transition.ok) {
        return NextResponse.json({ error: transition.reason }, { status: 422 });
      }
    }

    // B3 (Phase 2.5, gated by GATING_V1): non-subscribed artists can't
    // respond to placement requests. Accepting an active arrangement is
    // gated; declining + counters fall through so artists can still
    // turn down requests they can't take on.
    if (isFlagOn("GATING_V1") && isArtist && (status === "active" || counter)) {
      const sub = await isSubscribed(auth.user!.id);
      if (!sub.active) {
        return NextResponse.json(
          {
            error: "subscription_required",
            message: "Responding to placement requests requires an active Wallplace subscription.",
            upgrade_url: "/artist-portal/billing",
          },
          { status: 402 },
        );
      }
    }

    // Block pending-review artists from accepting placements. They can
    // still set up their profile, but they can't commit to a placement
    // arrangement until admin has approved them. Accepting a decline/
    // counter on their own prior request is allowed; only acceptance of
    // an incoming request is gated.
    if (isArtist && status === "active") {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("review_status")
        .eq("user_id", auth.user!.id)
        .maybeSingle();
      if (profile && profile.review_status === "pending") {
        return NextResponse.json(
          { error: "Your application is still under review. You can accept placements once we've approved your profile." },
          { status: 403 },
        );
      }
    }

    // F39, approval logic
    // Rules (simple, no legacy fallback pitfall):
    //   1. Block only the requester from accepting their own request.
    //   2. Block a true self-placement (both parties are the same user).
    //   3. Any authenticated party that is NOT the requester may accept/decline.
    // If proposed_by_user_id is unknown (legacy row or missing column), we still
    // allow either party to accept, the previous "only venue accepts" fallback
    // was wrong for venue-initiated placements.
    const requesterId = existing.proposed_by_user_id || null;
    let isRequester = requesterId !== null && requesterId === auth.user!.id;
    const isSelfPlacement =
      !!existing.artist_user_id &&
      !!existing.venue_user_id &&
      existing.artist_user_id === existing.venue_user_id;

    // Work out who currently owes a response, from the message trail.
    // Precedence for "the current requester" is:
    //   1. Sender of the most recent counter-offer (counters flip role).
    //   2. Sender of the original placement_request (fallback when the
    //      column is NULL and no counter exists yet).
    // If that person is the authenticated user, they cannot accept /
    // decline / counter their own outstanding offer.
    //
    // Earlier versions of this block conflated the two lookups and,
    // after a counter from the OTHER party, erroneously promoted the
    // original offerer back into "current requester" via the fallback
    //, which blocked them from responding to the counter. Keep the
    // two resolutions separate.
    if (!isRequester) {
      const { data: reqMsgs } = await db
        .from("messages")
        .select("sender_id, metadata, created_at")
        .eq("message_type", "placement_request")
        .order("created_at", { ascending: false })
        .limit(50);
      let latestCounterSender: string | null = null;
      let originalOfferSender: string | null = null;
      for (const m of (reqMsgs || []) as Array<{ sender_id: string | null; metadata: Record<string, unknown> | null }>) {
        if (m.metadata?.placementId !== id) continue;
        const sender = (m.metadata?.requesterUserId as string | undefined) || m.sender_id;
        if (!sender) continue;
        if (m.metadata?.counter === true) {
          if (!latestCounterSender) latestCounterSender = sender;
        } else {
          // Newest-first iteration: each overwrite lands on an older
          // row, so the final value is the oldest = original offer.
          originalOfferSender = sender;
        }
      }
      const effectiveRequester = latestCounterSender || originalOfferSender;
      if (effectiveRequester && effectiveRequester === auth.user!.id) {
        isRequester = true;
      }
    }

    // E20(b): no longer scoped to `existing.status === "pending"`. The pending
    // scope meant the guard did not run for a declined or cancelled row, which
    // is exactly where the force-activation happened. Defence in depth now that
    // the state machine above rejects those transitions anyway, and it covers
    // any future path that reaches active from a non-pending state.
    if (status === "active" || status === "declined") {
      if (isSelfPlacement) {
        return NextResponse.json(
          { error: "You cannot accept a placement you created yourself" },
          { status: 400 }
        );
      }
      if (isRequester) {
        return NextResponse.json(
          { error: "You cannot respond to your own placement request" },
          { status: 400 }
        );
      }
      if (!isArtist && !isVenue) {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 });
      }
      // Otherwise: the other party may accept. Fall through.
    }

    // Counter offer: revise terms and hand the "needs to respond" role
    // back to the other party. Allowed when the row is pending OR was
    // recently declined, a decline is now treated as "I'm not into
    // these terms; bring me a better offer", not the end of the deal.
    if (counter) {
      if (existing.status === "active") {
        return NextResponse.json({ error: "This placement has already been accepted" }, { status: 400 });
      }
      if (existing.status === "completed" || existing.status === "sold") {
        return NextResponse.json({ error: "This placement is already complete" }, { status: 400 });
      }
      if (existing.status === "cancelled") {
        return NextResponse.json({ error: "This placement was cancelled" }, { status: 400 });
      }
      if (isSelfPlacement) {
        return NextResponse.json({ error: "You cannot counter your own placement" }, { status: 400 });
      }
      // On a pending row the requester can't counter their own outstanding offer.
      // On a declined row the OPPOSITE applies, the decliner is the non-requester
      // and must wait for the other party to come back with better terms.
      if (existing.status === "pending" && isRequester) {
        return NextResponse.json({ error: "You cannot counter your own request" }, { status: 400 });
      }
      if (existing.status === "declined" && !isRequester) {
        return NextResponse.json(
          { error: "You declined this offer, wait for the other party to come back with new terms." },
          { status: 400 },
        );
      }
      if (!isArtist && !isVenue) {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 });
      }

      // Build the terms-only update (no role flip yet). We apply it with
      // .select() so the response tells us whether a row was actually
      // updated, not just whether the statement errored.
      const termsUpdates: Record<string, unknown> = {};
      if (counter.revenueSharePercent !== undefined) termsUpdates.revenue_share_percent = counter.revenueSharePercent;
      if (counter.qrEnabled !== undefined) termsUpdates.qr_enabled = counter.qrEnabled;
      if (counter.monthlyFeeGbp !== undefined) termsUpdates.monthly_fee_gbp = counter.monthlyFeeGbp;
      if (counter.arrangementType !== undefined) termsUpdates.arrangement_type = counter.arrangementType;
      // If the row was previously declined, the counter re-opens it so
      // the negotiation continues. The role flip below will hand the
      // ball to the other party.
      if (existing.status === "declined") {
        termsUpdates.status = "pending";
      }
      // Sending a counter is an engaging action — unarchive the row for
      // the counter sender so it shows up in their main list again.
      // (See the same-named block in the accept/decline path below.)
      if (isArtist) termsUpdates.hidden_for_artist = false;
      if (isVenue) termsUpdates.hidden_for_venue = false;

      let termsSaved = false;
      {
        const { data, error: termsErr } = await db.from("placements").update(termsUpdates).eq("id", id).select("id");
        if (!termsErr && Array.isArray(data) && data.length > 0) {
          termsSaved = true;
        } else if (termsErr) {
          // Row 22 (D65): the column-stripping retry that used to sit here is
          // DELETED. qr_enabled, monthly_fee_gbp, arrangement_type and both
          // hidden_for_* columns exist in prod, so the retry could not be doing
          // what it claimed — and a "successful" retry that had dropped
          // monthly_fee_gbp reported the counter as sent while the DB still held
          // the OLD fee, which is the worst possible outcome for a negotiation.
          // termsSaved stays false, so the caller gets the 500 below.
          console.error("Counter terms update failed for placement", id, termsErr.message);
        }
      }

      if (!termsSaved) {
        // We didn't update a single term, reject the counter. Returning
        // success here would leave the user thinking the new offer was
        // sent when the DB actually still holds the old terms.
        console.error("Counter terms update failed for placement", id);
        return NextResponse.json({ error: "Failed to save counter offer" }, { status: 500 });
      }

      // Role flip, write separately so a missing proposed_by_user_id column
      // on older environments doesn't roll back the terms update we just
      // confirmed. Fire-and-forget the retry; the terms are the critical
      // part of the counter.
      {
        const { error: flipErr } = await db
          .from("placements")
          .update({ proposed_by_user_id: auth.user!.id })
          .eq("id", id);
        if (flipErr) {
          console.warn("Counter role-flip failed (proposed_by_user_id):", flipErr.message);
        }
      }

      // Auto-message into the conversation so both parties see the counter in-thread.
      try {
        const counterpartyUserId = isArtist ? existing.venue_user_id : existing.artist_user_id;
        const myProfileTable = isArtist ? "artist_profiles" : "venue_profiles";
        const theirProfileTable = isArtist ? "venue_profiles" : "artist_profiles";
        const { data: mine } = await db.from(myProfileTable).select("slug, name").eq("user_id", auth.user!.id).single();
        const { data: theirs } = counterpartyUserId
          ? await db.from(theirProfileTable).select("slug, name").eq("user_id", counterpartyUserId).single()
          : { data: null };

        if (mine && theirs) {
          // Use the EXISTING conversation between these two parties if
          // one already has messages, so a counter doesn't spin up a
          // fresh thread in parallel to the chat the user is already
          // having. Only fall back to the deterministic id when no prior
          // thread exists. This fixes the "counter opened a new chat"
          // bug that happened after we consolidated placement threads.
          let cid: string | null = null;
          const { data: existingThread } = await db
            .from("messages")
            .select("conversation_id")
            .or(
              `and(sender_name.eq.${mine.slug},recipient_slug.eq.${theirs.slug}),and(sender_name.eq.${theirs.slug},recipient_slug.eq.${mine.slug})`,
            )
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          cid = existingThread?.conversation_id || deterministicConversationId(mine.slug, theirs.slug);
          // K3: this was a five-way ladder with two eslint-disable suppressions
          // of no-raw-arrangement-type, producing yet another vocabulary
          // ("Free loan arrangement", which no other surface says). The
          // canonical labeller names the arrangement; only the percentage,
          // which is genuinely local to a counter-offer, is composed here.
          const terms: string[] = [];
          if (counter.arrangementType || counter.revenueSharePercent !== undefined) {
            const label = counter.arrangementType
              ? labelForArrangement({
                  arrangementType: counter.arrangementType,
                  monthlyFeeGbp: counter.monthlyFeeGbp,
                  qrEnabled: counter.qrEnabled,
                })
              : "Revenue share";
            terms.push(
              counter.revenueSharePercent !== undefined
                ? `${label}: ${counter.revenueSharePercent}% to the venue`
                : label,
            );
          }
          if (counter.monthlyFeeGbp !== undefined) terms.push(`Monthly fee: \u00a3${counter.monthlyFeeGbp}`);
          if (counter.qrEnabled !== undefined) terms.push(counter.qrEnabled ? "QR enabled" : "QR disabled");
          const note = (counter.message || "").trim();
          const content = [
            "Counter offer sent:",
            terms.join(" \u00b7 "),
            note ? `\n"${note}"` : "",
          ].filter(Boolean).join("\n");

          await db.from("messages").insert({
            conversation_id: cid,
            sender_id: auth.user!.id,
            sender_name: mine.slug,
            sender_type: isArtist ? "artist" : "venue",
            recipient_slug: theirs.slug,
            recipient_user_id: counterpartyUserId,
            content,
            is_read: false,
            created_at: new Date().toISOString(),
            message_type: "placement_request",
            metadata: {
              placementId: id,
              counter: true,
              arrangementType: counter.arrangementType,
              revenueSharePercent: counter.revenueSharePercent ?? null,
              qrEnabled: counter.qrEnabled ?? null,
              monthlyFeeGbp: counter.monthlyFeeGbp ?? null,
              // Counter flips roles, the counter-er now awaits response.
              requesterUserId: auth.user!.id,
            },
          });

          if (counterpartyUserId) {
            createNotification({
              userId: counterpartyUserId,
              kind: "placement_request",
              title: "Counter offer received",
              body: `${mine.name} sent revised terms`,
              link: `/placements/${encodeURIComponent(id)}`,
            }).catch(() => {});

            // Email the counterparty (the new recipient of the request).
            // Idempotency includes the updated_at so serial counters on
            // the same row each send their own email.
            try {
              const { data: { user: counterpartyUser } } = await db.auth.admin.getUserById(counterpartyUserId);
              if (counterpartyUser?.email) {
                const changedTerms: string[] = [];
                if (counter.arrangementType !== undefined) changedTerms.push(`Arrangement: ${counter.arrangementType.replace("_", " ")}`);
                if (counter.monthlyFeeGbp !== undefined) changedTerms.push(`Monthly fee: £${counter.monthlyFeeGbp}`);
                if (counter.revenueSharePercent !== undefined) changedTerms.push(`Revenue share: ${counter.revenueSharePercent}%`);
                if (counter.qrEnabled !== undefined) changedTerms.push(counter.qrEnabled ? "QR enabled" : "QR disabled");
                await sendEmail({
                  idempotencyKey: `placement_counter:${id}:${Date.now()}`,
                  template: "placement_counter_offer_received",
                  category: "placements",
                  to: counterpartyUser.email,
                  subject: `${mine.name} sent revised terms`,
                  userId: counterpartyUserId,
                  react: PlacementCounterOfferReceived({
                    firstName: counterpartyUser.user_metadata?.first_name || theirs.name.split(" ")[0] || "there",
                    counterpartyName: mine.name,
                    placementUrl: `${SITE}/placements/${encodeURIComponent(id)}`,
                    changedTerms: changedTerms.length ? changedTerms : ["Revised terms, open the placement to review"],
                  }),
                  metadata: { placementId: id },
                });
              }
            } catch (err) {
              console.error("Counter email error:", err);
            }
          }
        }
      } catch (err) {
        console.warn("Counter auto-message skipped:", err);
      }

      return NextResponse.json({ success: true, countered: true });
    }

    // Accept / decline: only block the no-op cases (already in that
    // terminal state). Anything else in flight, pending, countered,
    // mid-update, is fine to respond to. A counter doesn't change
    // status, but this also covers any odd intermediate state we
    // might land in (e.g. a stale row briefly flagged something else).
    if (status === "active" && existing.status === "active") {
      return NextResponse.json({ error: "Already accepted" }, { status: 400 });
    }
    if (status === "declined" && existing.status === "declined") {
      return NextResponse.json({ error: "Already declined" }, { status: 400 });
    }

    // Artist cannot unilaterally change a pending placement into something other than active/declined
    if (isArtist && existing.status === "pending" && status === "pending") {
      // no-op but allowed
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    const now = new Date().toISOString();

    if (existing.status === "pending" && (status === "active" || status === "declined")) {
      updates.responded_at = now;
      if (status === "active") updates.accepted_at = now;
    }

    // Auto-unarchive on any engaging action. If a user previously
    // archived a placement (e.g. archived a pending request before
    // deciding) and now accepts / declines / advances it, treat that
    // engagement as implicit unarchive — otherwise the row would stay
    // hidden from their main list even after they've committed to it.
    // Cancellation is explicitly excluded: a user cancelling typically
    // wants the row out of sight, so don't fight their archive state.
    const isEngagingAction =
      status === "active" ||
      status === "declined" ||
      !!stage ||
      !!unsetStage;
    if (isEngagingAction) {
      if (isArtist) updates.hidden_for_artist = false;
      if (isVenue) updates.hidden_for_venue = false;
      // Also clear any legacy placement_archives row for this
      // (placement, user) pair. The GET filter prefers the column when
      // it's populated, but keeping the two stores in sync avoids
      // surprises on envs where the column is missing or where other
      // code paths still read the table directly. Fire-and-forget.
      db.from("placement_archives")
        .delete()
        .eq("placement_id", id)
        .eq("user_id", auth.user!.id)
        .then(() => {}, () => {});
    }

    // Stage transitions, once the placement is active, either party can
    // advance any stage in one click. The earlier bilateral-confirmation
    // flow (propose → other side confirms) was more friction than value
    // for the pilot, so it's been removed and the stepper writes the
    // real timestamp immediately.
    if (stage) {
      const effectiveStatus = status || existing.status;
      if (effectiveStatus !== "active") {
        return NextResponse.json({ error: "Placement must be active to advance the stage" }, { status: 400 });
      }

      // Use the explicit stageDate when the caller supplied one (e.g.
      // the Schedule date picker on the progress bar), otherwise fall
      // back to the current timestamp. Future dates are fine so venues
      // can pre-schedule installs, but reject dates in the past for the
      // `scheduled` stage so a typo (or a paste-bypass of the date
      // picker's `min` attribute) can't backdate an install.
      if (stage === "scheduled" && stageDate) {
        const draftDay = stageDate.slice(0, 10);
        const todayDay = new Date(now).toISOString().slice(0, 10);
        if (draftDay < todayDay) {
          return NextResponse.json(
            { error: "Install date can't be in the past." },
            { status: 400 },
          );
        }
      }
      const ts = stageDate || now;
      if (stage === "scheduled") updates.scheduled_for = ts;
      if (stage === "installed") updates.installed_at = ts;
      if (stage === "live") updates.live_from = ts;
      if (stage === "collected") {
        updates.collected_at = ts;
        updates.status = "completed";
      }
      // Clear any lingering proposal columns left over from the old flow.
      updates.proposed_stage = null;
      updates.proposed_by_user_id = null;
      updates.proposed_at = null;
    }

    // Undo a previously-stamped stage. Either party can pull a stage back
    // if they advanced too eagerly. We don't enforce "most recent" on the
    // server, the UI only ever surfaces undo for the latest reached
    // stage, and forcing the rule in two places risked rejecting valid
    // attempts when the columns were missing.
    if (unsetStage) {
      if (unsetStage === "scheduled") updates.scheduled_for = null;
      if (unsetStage === "installed") updates.installed_at = null;
      if (unsetStage === "live") updates.live_from = null;
      if (unsetStage === "collected") {
        updates.collected_at = null;
        // Undoing the final stage drops the placement back to active.
        updates.status = "active";
      }
    }

    // Row 22 (D65): the blanket retry that used to sit here is DELETED. It was the
    // broadest of the five — it fired on ANY error (a permission failure, a
    // constraint violation, a bad id) and stripped all ten lifecycle / proposal /
    // archive columns, so a stage advance could report success having written
    // nothing the caller asked for. Every one of those columns exists in prod.
    const { error } = await db.from("placements").update(updates).eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update placement" }, { status: 500 });
    }

    // ─── Paid-loan recurring billing ───
    // K2: accepting a placement no longer starts a Stripe subscription.
    // startPaidLoanBilling was the second of two implementations that could each
    // begin a monthly charge for the same placement, and with PAID_LOAN_V2 on it
    // would have produced two live subscriptions billing one venue twice. The
    // surviving entry point is the venue clicking "Set up payment"
    // (api/placements/[id]/payment/setup), which PaidLoanPaymentChip already
    // surfaces from the moment a paid-loan placement goes active.
    //
    // Nothing replaces the call. The chip keys off arrangement_type,
    // monthly_fee_gbp and subscription_status, so a 'pending' billing row would
    // be a write with no reader.
    //
    // The `billingPrompt` this used to return went with it: it carried a
    // SetupIntent client secret for a Stripe Elements flow that was never built.
    // Nothing in src/ read it off the response.
    //
    // Cancellation stays: on active → terminal, stop the Stripe subscription at
    // period-end (no current-month refund per spec).
    //
    // Active→declined is dead code in the canonical state machine
    // (decline is pending-only), but we keep the second branch
    // defensive in case a malformed PATCH lands.
    try {
      // D8: billing must stop whenever a placement leaves 'active' for a terminal
      // state, not only on an explicit cancel. A collection is the important case
      // and the one the plan's fix would miss: it arrives as stage: "collected",
      // which sets updates.status = "completed" rather than the body `status`, so
      // this reads the EFFECTIVE new status (the same `updates.status ?? existing`
      // the inventory block below already uses). `sold` is covered for the same
      // reason. Otherwise the venue keeps paying a monthly fee for a piece that has
      // come off the wall.
      const effectiveNewStatus = (updates.status as string | undefined) ?? existing.status;
      const goingInactive =
        existing.status === "active" &&
        (effectiveNewStatus === "cancelled" ||
          effectiveNewStatus === "completed" ||
          effectiveNewStatus === "sold");
      if (goingInactive) {
        await cancelPaidLoanBilling(id);
      }
    } catch (billingErr) {
      console.error("[placements PATCH] paid-loan billing hook failed:", billingErr);
      // Don't fail the placement transition over a billing-side error;
      // the webhook reconciler will catch up on the next invoice cycle.
    }

    // ─── Inventory + venue attribution on placement transitions ───
    // First-time pending → active: decrement finite stock on the linked
    // work and stamp placed_at_venue + current_placement_id so the
    // artwork detail page and portfolio overlay can show "Placed at X".
    // Active → collected (set elsewhere via stage="collected"): restore
    // stock and clear the stamps. Idempotent: gated on the pre-update
    // existing.status snapshot so a no-op PATCH doesn't double-fire.
    //
    // Best-effort: failures here are logged but don't fail the API call,
    // since the placement state transition itself succeeded above. If
    // the artist_works columns aren't migrated yet (pre-038), the
    // updates silently no-op via the IF NOT EXISTS guard in the
    // migration; here the update will return an error which we swallow.
    try {
      const becameActive = existing.status === "pending" && status === "active";
      // E23b. This keyed on the STAGE, so a direct {status:"completed"} write
      // left it false: quantity_available was never restored, `available`
      // stayed false where the decrement had hit zero, and placed_at_venue kept
      // pointing at a finished placement. Any party could burn an artist's
      // inventory with a legitimate-looking request. Keyed on the resulting
      // status now, whichever path produced it.
      const effectiveStatus = (updates.status as string | undefined) ?? existing.status;
      const becameCollected =
        existing.status === "active" && effectiveStatus === "completed";
      if (becameActive || becameCollected) {
        // Production schema stores work data denormalised on the
        // placement (work_title + extra_works JSONB), there is no
        // FK to artist_works.id. Match by title within the artist's
        // portfolio, primary work + every extra. Same pattern the
        // venue-portal/labels page uses.
        const { data: pl } = await db
          .from("placements")
          .select("work_title, extra_works")
          .eq("id", id)
          .maybeSingle();
        const titles = new Set<string>();
        if (typeof pl?.work_title === "string" && pl.work_title) titles.add(pl.work_title);
        if (Array.isArray(pl?.extra_works)) {
          for (const ew of pl.extra_works as Array<{ title?: string }>) {
            if (typeof ew?.title === "string" && ew.title) titles.add(ew.title);
          }
        }

        if (titles.size > 0 && existing.artist_user_id) {
          // Resolve titles → artist_works rows scoped to this artist.
          // Postgres lookup by artist_id (the FK) requires the artist's
          // profile id, not the user id; resolve once.
          const { data: artistProfile } = await db
            .from("artist_profiles")
            .select("id")
            .eq("user_id", existing.artist_user_id)
            .maybeSingle();
          if (artistProfile?.id) {
            const { data: matchedWorks } = await db
              .from("artist_works")
              .select("id, quantity_available, current_placement_id")
              .eq("artist_id", artistProfile.id)
              .in("title", Array.from(titles));

            if (becameActive) {
              const { data: venueP } = await db
                .from("venue_profiles")
                .select("name")
                .eq("user_id", existing.venue_user_id)
                .maybeSingle();
              const venueDisplay = venueP?.name ?? existing.venue ?? null;
              for (const w of (matchedWorks || []) as Array<{ id: string; quantity_available: number | null }>) {
                const updates: Record<string, unknown> = {
                  placed_at_venue: venueDisplay,
                  current_placement_id: id,
                };
                if (typeof w.quantity_available === "number" && w.quantity_available > 0) {
                  const next = w.quantity_available - 1;
                  updates.quantity_available = next;
                  updates.available = next > 0;
                }
                await db.from("artist_works").update(updates).eq("id", w.id);
              }
            } else if (becameCollected) {
              for (const w of (matchedWorks || []) as Array<{ id: string; quantity_available: number | null; current_placement_id: string | null }>) {
                // Only restore if THIS placement still owns the work.
                if (w.current_placement_id === id) {
                  const restoreUpdates: Record<string, unknown> = {
                    placed_at_venue: null,
                    current_placement_id: null,
                  };
                  if (typeof w.quantity_available === "number") {
                    restoreUpdates.quantity_available = w.quantity_available + 1;
                    restoreUpdates.available = true;
                  }
                  await db.from("artist_works").update(restoreUpdates).eq("id", w.id);
                }
              }
            }
          }
        }
      }
    } catch (invErr) {
      console.error("[placements] inventory attribution failed (non-fatal):", invErr);
    }

    // ─── Stage transition emails ───
    // Once the DB update is committed, fan out an email to both parties
    // for the stages users actually want reminders of. Idempotency keyed
    // by placement-id + stage so repeats are no-ops.
    if (stage && existing.artist_user_id && existing.venue_user_id) {
      try {
        const [{ data: { user: artistUser } }, { data: { user: venueUser } }] = await Promise.all([
          db.auth.admin.getUserById(existing.artist_user_id),
          db.auth.admin.getUserById(existing.venue_user_id),
        ]);
        const [{ data: artistP }, { data: venueP }] = await Promise.all([
          db.from("artist_profiles").select("name").eq("user_id", existing.artist_user_id).single(),
          db.from("venue_profiles").select("name").eq("user_id", existing.venue_user_id).single(),
        ]);
        const artistName = artistP?.name || "The artist";
        const venueName = venueP?.name || existing.venue || "The venue";
        const placementUrl = `${SITE}/placements/${encodeURIComponent(id)}`;

        async function sendToParty(opts: {
          user: typeof artistUser;
          firstName: string;
          template: string;
          subject: string;
          react: Parameters<typeof sendEmail>[0]["react"];
          userId: string;
          idempotencyKey: string;
        }) {
          if (!opts.user?.email) return;
          await sendEmail({
            idempotencyKey: opts.idempotencyKey,
            template: opts.template,
            category: "placements",
            to: opts.user.email,
            subject: opts.subject,
            userId: opts.userId,
            react: opts.react,
            metadata: { placementId: id, stage },
          });
        }

        // Format as "30 April 2026, 14:30". Now that the picker captures
        // time, surface it in the email so both parties see exactly when
        // the install is scheduled rather than just the date.
        const scheduledLabel = updates.scheduled_for
          ? (() => {
              const d = new Date(updates.scheduled_for as string);
              const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return `${date}, ${time}`;
            })()
          : "soon";

        if (stage === "scheduled") {
          for (const party of [
            { user: artistUser, name: artistName, uid: existing.artist_user_id },
            { user: venueUser, name: venueName, uid: existing.venue_user_id },
          ]) {
            await sendToParty({
              user: party.user,
              firstName: (party.name).split(" ")[0] || "there",
              userId: party.uid,
              idempotencyKey: `placement_scheduled:${id}:${party.uid}`,
              template: "placement_scheduled",
              subject: `Install scheduled for ${scheduledLabel}`,
              react: PlacementScheduled({
                firstName: (party.name).split(" ")[0] || "there",
                placementUrl,
                venueName,
                artistName,
                scheduledDate: scheduledLabel,
              }),
            });
          }
        }

        if (stage === "installed") {
          for (const party of [
            { user: artistUser, name: artistName, uid: existing.artist_user_id },
            { user: venueUser, name: venueName, uid: existing.venue_user_id },
          ]) {
            await sendToParty({
              user: party.user,
              firstName: (party.name).split(" ")[0] || "there",
              userId: party.uid,
              idempotencyKey: `placement_installed:${id}:${party.uid}`,
              template: "placement_artwork_installed",
              subject: `${artistName}'s work is now at ${venueName}`,
              react: PlacementArtworkInstalled({
                firstName: (party.name).split(" ")[0] || "there",
                placementUrl,
                venueName,
                artistName,
                installedWorks: [],
                qrLabelsUrl: `${SITE}/artist-portal/labels?venue=${encodeURIComponent(existing.venue_slug || "")}`,
              }),
            });
          }
        }

        if (stage === "collected") {
          for (const party of [
            { user: artistUser, name: artistName, uid: existing.artist_user_id },
            { user: venueUser, name: venueName, uid: existing.venue_user_id },
          ]) {
            await sendToParty({
              user: party.user,
              firstName: (party.name).split(" ")[0] || "there",
              userId: party.uid,
              idempotencyKey: `placement_ended:${id}:${party.uid}`,
              template: "placement_ended",
              subject: `Your placement at ${venueName} has ended`,
              react: PlacementEnded({
                firstName: (party.name).split(" ")[0] || "there",
                placementUrl,
                venueName,
                returnInstructionsUrl: `${placementUrl}?record=open`,
                reviewUrl: `${placementUrl}/review`,
              }),
            });
          }
        }
      } catch (err) {
        console.error("Stage email error:", err);
      }

      // Bell notifications for stage transitions, fire alongside the
      // emails so users see the change in-app even if email is filtered
      // / spam-foldered. Both parties get notified for stages that
      // genuinely matter to either side: scheduled, installed, live,
      // collected. Idempotency keyed by id+stage+user so re-PATCHing
      // the same stage doesn't double-bell.
      try {
        const stageHeadlines: Record<string, string> = {
          scheduled: "Install date set",
          installed: "Artwork installed",
          live: "Live on wall",
          collected: "Placement collected",
        };
        const stageBodies: Record<string, (venue: string) => string> = {
          scheduled: (v) => `${v}, install scheduled`,
          installed: (v) => `${v}, work is up`,
          live: (v) => `${v}, now publicly live`,
          collected: (v) => `${v}, placement complete`,
        };
        const headline = stageHeadlines[stage as string];
        if (headline) {
          const venueLabel = (existing.venue as string) || "Venue";
          for (const uid of [existing.artist_user_id, existing.venue_user_id]) {
            if (!uid) continue;
            createNotification({
              userId: uid,
              kind: `placement_${stage}`,
              title: headline,
              body: stageBodies[stage as string](venueLabel),
              link: `/placements/${encodeURIComponent(id)}`,
            }).catch((err) => console.warn("[placements] stage notification failed:", err));
          }
        }
      } catch (err) {
        console.warn("[placements] stage notification block failed:", err);
      }
    }

    // On pending → active/declined, notify the requester. If the column
    // was NULL we try to infer from the first placement_request message,
    // otherwise the decliner's decision never reaches the other party's
    // bell icon, which was the "I didn't get notified when placement was
    // declined" gap.
    let notifyRequesterId: string | null = requesterId;
    if (!notifyRequesterId) {
      const { data: firstMsgs } = await db
        .from("messages")
        .select("sender_id, metadata, created_at")
        .eq("message_type", "placement_request")
        .order("created_at", { ascending: true })
        .limit(20);
      for (const m of (firstMsgs || []) as Array<{ sender_id: string | null; metadata: Record<string, unknown> | null }>) {
        if (m.metadata?.placementId === id) {
          const s = (m.metadata?.requesterUserId as string | undefined) || m.sender_id;
          if (s && s !== auth.user!.id) { notifyRequesterId = s; break; }
        }
      }
    }
    // Final fallback, if we still don't know the requester (legacy
    // row, no message trail, etc.), use whichever party isn't us. The
    // assumption: the responder is by definition not the requester, so
    // the other side of the deal is the right notification target.
    // This stops "no email + no bell" from silently happening on
    // placements with a NULL proposed_by_user_id.
    if (!notifyRequesterId) {
      if (auth.user!.id === existing.artist_user_id && existing.venue_user_id) {
        notifyRequesterId = existing.venue_user_id;
      } else if (auth.user!.id === existing.venue_user_id && existing.artist_user_id) {
        notifyRequesterId = existing.artist_user_id;
      }
    }
    // Notify + post thread message on any pending → active/declined
    // transition. The notification half is gated on knowing who the
    // requester is (so we have someone to email/bell). The in-thread
    // placement_response message is NOT gated on that, it only needs
    // to know the two slugs, and it's essential for the messages view
    // to reflect the latest decision. (Previously both were inside the
    // same `if (notifyRequesterId && …)`, so any placement with a
    // missing proposed_by_user_id AND no recoverable fallback silently
    // left the messages panel stuck on Accept/Counter/Decline.)
    if (
      notifyRequesterId &&
      existing.status === "pending" &&
      (status === "active" || status === "declined")
    ) {
      // Always fire the in-app bell notification first, independent of
      // email so a flaky email service / suppression / preferences gate
      // can't take down the bell alert too. Previously this lived at
      // the bottom of the try block below, meaning any pre-email
      // exception (e.g. auth.admin.getUserById hiccup, render error in
      // a template) silently lost the notification + the email together.
      createNotification({
        userId: notifyRequesterId,
        kind: status === "active" ? "placement_accepted" : "placement_declined",
        title: status === "active" ? "Placement accepted" : "Placement declined",
        body: existing.venue || "Venue",
        link: `/placements/${encodeURIComponent(id)}`,
      }).catch((err) => console.warn("[placements] createNotification failed:", err));

      try {
        const { data: { user: requesterUser } } = await db.auth.admin.getUserById(notifyRequesterId);
        const { data: artistProfile } = await db
          .from("artist_profiles")
          .select("name")
          .eq("user_id", existing.artist_user_id)
          .single();

        if (requesterUser?.email && artistProfile) {
          // New pipeline: polished template + logging + preferences check.
          // Legacy notifyPlacementResponse is retained below as a safety
          // net while we confirm deliverability on the new path.
          const requesterFirstName = requesterUser.user_metadata?.first_name
            || (artistProfile.name || "there").split(" ")[0];
          const placementUrl = `${SITE}/placements/${encodeURIComponent(id)}`;
          const venueName = existing.venue || "Venue";

          // Figure out who the requester is (artist vs venue) so we pick
          // the right template. The requester is whoever isn't us (the
          // responder).
          const responderIsArtist = auth.user!.id === existing.artist_user_id;
          const requesterIsArtist = !responderIsArtist;

          if (status === "active") {
            if (requesterIsArtist) {
              await sendEmail({
                idempotencyKey: `placement_response:${id}:accepted`,
                template: "artist_placement_accepted",
                category: "placements",
                to: requesterUser.email,
                subject: `${venueName} accepted your placement`,
                userId: notifyRequesterId,
                react: ArtistPlacementAccepted({
                  firstName: requesterFirstName,
                  venueName,
                  placementUrl,
                  nextSteps: [
                    `Confirm install date with ${venueName}`,
                    "Print QR labels for each piece",
                    "Finalise the consignment record",
                  ],
                  qrLabelsUrl: `${SITE}/artist-portal/labels?venue=${encodeURIComponent(existing.venue_slug || "")}`,
                  consignmentRecordUrl: `${placementUrl}?record=open`,
                }),
                metadata: { placementId: id },
              });
            } else {
              // Venue was the requester, send their polished receipt
              // confirming the artist accepted, with next-step nudges.
              await sendEmail({
                idempotencyKey: `placement_response:${id}:accepted`,
                template: "venue_placement_accepted_confirmation",
                category: "placements",
                to: requesterUser.email,
                subject: `Placement confirmed with ${artistProfile.name}`,
                userId: notifyRequesterId,
                react: VenuePlacementAcceptedConfirmation({
                  firstName: requesterFirstName,
                  artistName: artistProfile.name,
                  placementUrl,
                  nextSteps: [
                    `Confirm install date with ${artistProfile.name}`,
                    "Share venue logistics, opening hours, lighting, install timing",
                    "Review the consignment record together",
                  ],
                }),
                metadata: { placementId: id },
              });
            }
          } else if (status === "declined") {
            if (requesterIsArtist) {
              await sendEmail({
                idempotencyKey: `placement_response:${id}:declined`,
                template: "artist_placement_declined",
                category: "placements",
                to: requesterUser.email,
                subject: `${venueName} passed on this placement`,
                userId: notifyRequesterId,
                react: ArtistPlacementDeclined({
                  firstName: requesterFirstName,
                  venueName,
                  discoverMoreVenuesUrl: `${SITE}/spaces`,
                }),
                metadata: { placementId: id },
              });
            } else {
              await sendEmail({
                idempotencyKey: `placement_response:${id}:declined`,
                template: "placement_venue_declined_artist_request",
                category: "placements",
                to: requesterUser.email,
                subject: `${artistProfile.name} passed on your placement request`,
                userId: notifyRequesterId,
                react: PlacementVenueDeclinedArtistRequest({
                  firstName: requesterFirstName,
                  artistName: artistProfile.name,
                  browseArtistsUrl: `${SITE}/browse`,
                }),
                metadata: { placementId: id },
              });
            }
          }
        }

        // (Bell notification was already fired above, moved out of
        // this try so an email-side exception can't take it down.)
      } catch (err) {
        console.warn("Response email skipped:", err);
      }
    }

    if (
      existing.status === "pending" &&
      (status === "active" || status === "declined")
    ) {
      // Post a placement_response message in the existing conversation so
      // the messages view reflects the decision without the user having to
      // click Accept/Decline there too. Any prior placement_request
      // messages will now render as "✓ Accepted" or "✗ Declined".
      try {
        const [{ data: artistP }, { data: venueP }] = await Promise.all([
          existing.artist_user_id
            ? db.from("artist_profiles").select("slug, name").eq("user_id", existing.artist_user_id).single()
            : Promise.resolve({ data: null } as { data: { slug: string; name: string } | null }),
          existing.venue_user_id
            ? db.from("venue_profiles").select("slug, name").eq("user_id", existing.venue_user_id).single()
            : Promise.resolve({ data: null } as { data: { slug: string; name: string } | null }),
        ]);
        const artistSlug = (artistP?.slug || existing.artist_slug) as string | null;
        const venueSlug = (venueP?.slug || existing.venue_slug) as string | null;
        if (artistSlug && venueSlug) {
          // Responder is whoever's NOT the requester.
          const responderIsArtist = auth.user!.id === existing.artist_user_id;
          const senderSlug = responderIsArtist ? artistSlug : venueSlug;
          const recipientSlug = responderIsArtist ? venueSlug : artistSlug;
          const senderType = responderIsArtist ? "artist" : "venue";
          const recipientUserId = responderIsArtist ? existing.venue_user_id : existing.artist_user_id;
          const content = status === "active"
            ? "Placement request accepted."
            : "Placement request declined.";

          // Land the response in the same conversation as the original
          // placement_request so the thread shows "Accepted" / "Declined"
          // inline. Fall back to the legacy placement-* id, then to the
          // dm-* id used by /api/messages.
          const { data: originalMsg } = await db
            .from("messages")
            .select("conversation_id")
            .eq("message_type", "placement_request")
            .contains("metadata", { placementId: id })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const [a, b] = [senderSlug, recipientSlug].sort();
          const conversationId = originalMsg?.conversation_id
            || deterministicConversationId(senderSlug, recipientSlug)
            || `dm-${a}__${b}`;

          const baseMsg = {
            conversation_id: conversationId,
            sender_id: auth.user!.id,
            sender_name: senderSlug,
            sender_type: senderType,
            recipient_slug: recipientSlug,
            recipient_user_id: recipientUserId || null,
            content,
            // Auto-system messages are pre-read for the recipient.
            // They get a dedicated `placement_accepted` /
            // `placement_declined` in-app notification AND a polished
            // email; counting this message as unread on top causes
            // the messages bell to bump in addition to the
            // notifications bell, what users reported as "double
            // notifications". The message still renders inline in
            // the thread for context when the user actually opens
            // the conversation.
            is_read: true,
            created_at: new Date().toISOString(),
          };
          const extendedMsg = {
            ...baseMsg,
            message_type: "placement_response",
            metadata: { placementId: id, status },
          };
          // Row 22 (D65): same deleted fallback as the other message inserts.
          const { error: msgErr } = await db.from("messages").insert(extendedMsg);
          if (msgErr) {
            console.warn("Auto placement_response message failed:", msgErr.message);
          }
        }
      } catch (err) {
        console.warn("Placement response message skipped:", err);
      }
    }

    // ─── Cancellation fan-out ──────────────────────────────────────────
    // Either side can cancel a pending or active placement. The DB row
    // is already updated above, but without a notification + email +
    // in-thread message the OTHER party has no signal anything changed.
    // Mirrors the accept/decline fan-out so a cancellation reaches the
    // counterparty the same way a decline would.
    if (
      status === "cancelled" &&
      existing.status !== "cancelled" &&
      existing.artist_user_id &&
      existing.venue_user_id
    ) {
      const cancellerIsArtist = auth.user!.id === existing.artist_user_id;
      const otherPartyUserId = cancellerIsArtist
        ? existing.venue_user_id
        : existing.artist_user_id;
      const otherPartyPersona: "artist" | "venue" = cancellerIsArtist ? "venue" : "artist";

      try {
        const [{ data: artistProfile }, { data: venueProfile }] = await Promise.all([
          db.from("artist_profiles").select("slug, name").eq("user_id", existing.artist_user_id).maybeSingle(),
          db.from("venue_profiles").select("slug, name").eq("user_id", existing.venue_user_id).maybeSingle(),
        ]);
        const artistName = artistProfile?.name || "The artist";
        const venueName = venueProfile?.name || existing.venue || "The venue";
        const cancellerName = cancellerIsArtist ? artistName : venueName;
        const otherPartyName = cancellerIsArtist ? venueName : artistName;
        const placementUrl = `${SITE}/placements/${encodeURIComponent(id)}`;

        // Bell notification. Fire first, independent of email, so a
        // flaky email service can't drop the in-app signal too.
        createNotification({
          userId: otherPartyUserId,
          kind: "placement_cancelled",
          title: "Placement cancelled",
          body: `${cancellerName} cancelled the placement`,
          link: `/placements/${encodeURIComponent(id)}`,
        }).catch((err) => console.warn("[placements] cancel notification failed:", err));

        // Email the other party. Idempotency keyed by id alone, the row
        // can only transition into cancelled once (the gate above blocks
        // re-fires).
        try {
          const { data: { user: otherPartyUser } } = await db.auth.admin.getUserById(otherPartyUserId);
          if (otherPartyUser?.email) {
            const firstName = otherPartyUser.user_metadata?.first_name
              || (otherPartyName || "there").split(" ")[0];
            const nextStepUrl = otherPartyPersona === "artist"
              ? `${SITE}/spaces`
              : `${SITE}/browse`;
            await sendEmail({
              idempotencyKey: `placement_cancelled:${id}`,
              template: "placement_cancelled",
              category: "placements",
              to: otherPartyUser.email,
              subject: `${cancellerName} cancelled the placement`,
              userId: otherPartyUserId,
              react: PlacementCancelled({
                firstName,
                cancelledByName: cancellerName,
                recipientPersona: otherPartyPersona,
                placementUrl,
                nextStepUrl,
              }),
              metadata: { placementId: id },
            });
          }
        } catch (err) {
          console.warn("Cancellation email skipped:", err);
        }

        // Post a placement_response message into the conversation so the
        // chat reflects the cancellation. Reuses placement_response so
        // existing message_type filters / queries keep working; the
        // metadata.status field carries the "cancelled" signal that the
        // MessageInbox renders as its own pill.
        try {
          const artistSlug = artistProfile?.slug || existing.artist_slug;
          const venueSlug = venueProfile?.slug || existing.venue_slug;
          if (artistSlug && venueSlug) {
            const senderSlug = cancellerIsArtist ? artistSlug : venueSlug;
            const recipientSlug = cancellerIsArtist ? venueSlug : artistSlug;
            const senderType = cancellerIsArtist ? "artist" : "venue";

            const { data: originalMsg } = await db
              .from("messages")
              .select("conversation_id")
              .eq("message_type", "placement_request")
              .contains("metadata", { placementId: id })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const [a, b] = [senderSlug, recipientSlug].sort();
            const conversationId = originalMsg?.conversation_id
              || deterministicConversationId(senderSlug, recipientSlug)
              || `dm-${a}__${b}`;

            const baseMsg = {
              conversation_id: conversationId,
              sender_id: auth.user!.id,
              sender_name: senderSlug,
              sender_type: senderType,
              recipient_slug: recipientSlug,
              recipient_user_id: otherPartyUserId,
              content: `${cancellerName} cancelled the placement.`,
              // Pre-read like the accept/decline auto-messages so the
              // bell only bumps once (notification, not message).
              is_read: true,
              created_at: new Date().toISOString(),
            };
            const extendedMsg = {
              ...baseMsg,
              message_type: "placement_response",
              metadata: { placementId: id, status: "cancelled" },
            };
            // Row 22 (D65): same deleted fallback as the other message inserts.
            const { error: msgErr } = await db.from("messages").insert(extendedMsg);
            if (msgErr) {
              console.warn("Auto cancellation message failed:", msgErr.message);
            }
          }
        } catch (err) {
          console.warn("Cancellation thread message skipped:", err);
        }
      } catch (err) {
        console.warn("Cancellation fan-out failed:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[placements] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: artist removes a placement
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || id.length > 100) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    // Fetch only the two ownership columns, these are the only ones we
    // need to authorise the archive action, and every env has them.
    // proposed_by_user_id was previously also requested here but some
    // Supabase instances predate migration 008 and don't have that
    // column; its absence made the SELECT error, `existing` come back
    // null, the endpoint return 404, and the client interpret 404 as
    // "already gone" (leaving the optimistic hide in place but no
    // server change, so the row reappeared on refresh).
    const { data: existing, error: fetchErr } = await db
      .from("placements")
      .select("artist_user_id, venue_user_id")
      .eq("id", id)
      .single();

    if (fetchErr && fetchErr.code === "PGRST116") {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }
    if (fetchErr || !existing) {
      console.error("Placement fetch failed before archive:", fetchErr);
      return NextResponse.json(
        { error: fetchErr?.message || "Could not look up placement" },
        { status: 500 },
      );
    }

    const isArtist = !!existing.artist_user_id && existing.artist_user_id === auth.user!.id;
    const isVenue = !!existing.venue_user_id && existing.venue_user_id === auth.user!.id;

    if (!isArtist && !isVenue) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    // Archive-only: we never hard-delete placements. Hide the row from
    // the caller's own view; the counterparty's view is untouched.
    // Reversed via ?unarchive=1.
    const { searchParams: sp2 } = new URL(request.url);
    const unarchive = sp2.get("unarchive") === "1";

    const updates: Record<string, unknown> = {};
    if (isArtist) updates.hidden_for_artist = !unarchive;
    if (isVenue) updates.hidden_for_venue = !unarchive;

    const { data: softData, error: softErr } = await db
      .from("placements")
      .update(updates)
      .eq("id", id)
      .select("id");

    // Migration 026 not applied → fall back to the placement_archives
    // audit table, which we create on first use so archiving works on
    // any env without touching the placements schema. This avoids the
    // "optimistically hidden then snaps back on refresh" problem users
    // see when the hidden_for_* columns are missing.
    const errMsg = String(softErr?.message || "").toLowerCase();
    const columnMissing = errMsg.includes("hidden_for_artist")
      || errMsg.includes("hidden_for_venue")
      || errMsg.includes("could not find the")
      || errMsg.includes("does not exist");

    if (softErr && columnMissing) {
      // Fallback path: a separate placement_archives (placement_id,
      // user_id) table. We try an INSERT / DELETE on it. If that table
      // also doesn't exist yet, the caller will see a clear error and
      // can apply the migration.
      if (unarchive) {
        const { error: archDelErr } = await db
          .from("placement_archives")
          .delete()
          .eq("placement_id", id)
          .eq("user_id", auth.user!.id);
        if (archDelErr) {
          console.error("Fallback unarchive failed:", archDelErr);
          return NextResponse.json(
            { error: "Archive requires migration 026, apply 026_placement_soft_delete.sql (or create a placement_archives(placement_id, user_id) table)." },
            { status: 500 },
          );
        }
        return NextResponse.json({ success: true, archived: false, id, fallback: true });
      }
      const { error: archInsErr } = await db
        .from("placement_archives")
        .upsert(
          { placement_id: id, user_id: auth.user!.id, archived_at: new Date().toISOString() },
          { onConflict: "placement_id,user_id" },
        );
      if (archInsErr) {
        console.error("Fallback archive insert failed:", archInsErr);
        return NextResponse.json(
          { error: "Archive requires migration 026, apply 026_placement_soft_delete.sql (or create a placement_archives(placement_id, user_id) table)." },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, archived: true, id, fallback: true });
    }

    if (softErr || !softData || softData.length === 0) {
      console.error("Placement archive failed:", softErr);
      return NextResponse.json(
        { error: softErr?.message || "Could not archive the placement" },
        { status: 500 },
      );
    }

    // Clean up any legacy placement_archives row for this (placement, user)
    // pair when the caller unarchives. The GET filter now prefers the column
    // over the table, but deleting the stale row keeps the two sources in
    // sync so other places that still hit placement_archives directly don't
    // see a phantom archive entry.
    if (unarchive) {
      await db
        .from("placement_archives")
        .delete()
        .eq("placement_id", id)
        .eq("user_id", auth.user!.id)
        .then(() => {}, () => {});
    }

    return NextResponse.json({
      success: true,
      archived: !unarchive,
      id,
    });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This one already bound and logged the error, so
    // it was never silent, but it still flattened an AuthzError's 403/404 into a
    // 400. Found by the surfacing gate rather than by the `} catch {` sweep,
    // which could not match a catch that was already bound.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("DELETE /api/placements exception:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
