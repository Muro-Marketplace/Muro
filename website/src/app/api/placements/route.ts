import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { placementSchema, placementUpdateSchema } from "@/lib/validations";
import { notifyPlacementRequest, notifyPlacementResponse } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { VenueNewPlacementRequest } from "@/emails/templates/placements/VenueNewPlacementRequest";
import { ArtistPlacementAccepted } from "@/emails/templates/placements/ArtistPlacementAccepted";
import { ArtistPlacementDeclined } from "@/emails/templates/placements/ArtistPlacementDeclined";
import { ArtistPlacementRequestSent } from "@/emails/templates/placements/ArtistPlacementRequestSent";
import { VenuePlacementAcceptedConfirmation } from "@/emails/templates/placements/VenuePlacementAcceptedConfirmation";
import { PlacementVenueDeclinedArtistRequest } from "@/emails/templates/placements/PlacementVenueDeclinedArtistRequest";
import { PlacementCounterOfferReceived } from "@/emails/templates/placements/PlacementCounterOfferReceived";
import { PlacementScheduled } from "@/emails/templates/placements/PlacementScheduled";
import { PlacementArtworkInstalled } from "@/emails/templates/placements/PlacementArtworkInstalled";
import { PlacementEnded } from "@/emails/templates/placements/PlacementEnded";
import { z } from "zod";

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

    // Plan G #6c: artist portal asks for ?engaged=true to drop pending
    // venue-initiated requests the artist has never opened. A row is
    // 'engaged' when ANY is true:
    //   - status != 'pending'  (already moved past discovery)
    //   - requester_user_id === caller  (the artist initiated it)
    // The third potential branch (caller has sent a message into the
    // thread) is omitted on purpose — it requires a metadata join that
    // the existing PostgREST select doesn't easily express, and the two
    // conditions above already cover the bulk of the discovery noise.
    const engagedOnly =
      new URL(request.url).searchParams.get("engaged") === "true";
    if (engagedOnly && role.type === "artist") {
      query = query.or(
        `status.neq.pending,requester_user_id.eq.${auth.user!.id}`,
      );
    }

    let { data, error } = await query.order("created_at", { ascending: false });

    // Retry without any envs where the hidden_for_* columns don't exist
    // yet (pre-migration 026). We select("*") so it should always
    // succeed, but some SELECT statements in deployments may be strict.
    if (error && String(error.message || "").toLowerCase().includes("hidden_for")) {
      const retry = await db
        .from("placements")
        .select("*")
        .eq(role.type === "artist" ? "artist_user_id" : "venue_user_id", auth.user!.id)
        .order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error;
    }

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
      const columnHidden = (p as Record<string, unknown>)[hiddenFlag] === true;
      const tableHidden = typeof p.id === "string" && fallbackArchivedIds.has(p.id);
      const hidden = columnHidden || tableHidden;
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
    //      to backfill legacy rows where requester_user_id is NULL.
    //   2. latestCountererByPlacement, the sender of the MOST RECENT
    //      counter message, which is the authoritative current
    //      requester even if the placements.requester_user_id column
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
        // requester_user_id is missing).
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
        if (row && !row.requester_user_id) {
          db.from("placements").update({ requester_user_id: uid }).eq("id", pid).then(() => {}, () => {});
        }
      }
    }

    const enriched = placements.map((p) => {
      const pid = p.id as string;
      // Precedence for the "who currently holds the request" field:
      //   1. The latest counter message (source of truth, even if the
      //      DB column didn't flip, the counter sender should not be
      //      able to accept / decline their own counter).
      //   2. The placements.requester_user_id column.
      //   3. The inferred original requester.
      const counterer = pid ? latestCountererByPlacement[pid] : null;
      const resolvedRequester = counterer?.userId
        || p.requester_user_id
        || (pid ? inferredRequesters[pid] : null)
        || null;
      return {
        ...p,
        requester_user_id: resolvedRequester,
        revenue_earned_gbp: pid && earnedByPlacement[pid]
          ? Math.round(earnedByPlacement[pid] * 100) / 100
          : 0,
        qr_scans: pid ? (qrByPlacement[pid] || 0) : 0,
      };
    });

    return NextResponse.json({ placements: enriched, userType: role.type });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: artist or venue creates a placement request
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

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

    let artistProfile: { user_id: string; slug: string; name: string } | null = null;
    let venueProfile: { user_id: string; slug: string; name: string } | null = null;

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

      // Anti-spam outreach cap (#39). Caps NEW placement requests per
      // calendar day per tier, Core 2, Premium 5, Pro 10. Counts
      // unique placements created today by this artist; counter-offers
      // / status changes on existing placements aren't affected. Pro
      // Wallplace staff (`subscription_plan = 'pro'`) and any future
      // unlimited tier use the `-1` sentinel.
      const planRow = await db
        .from("artist_profiles")
        .select("subscription_plan")
        .eq("user_id", auth.user!.id)
        .single<{ subscription_plan: string | null }>();
      const dailyPlacementLimits: Record<string, number> = { core: 2, premium: 5, pro: 10 };
      const planKey = (planRow.data?.subscription_plan || "core").toLowerCase();
      const placementCap = dailyPlacementLimits[planKey] ?? dailyPlacementLimits.core;
      if (placementCap !== -1) {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const { count } = await db
          .from("placements")
          .select("id", { count: "exact", head: true })
          .eq("artist_user_id", auth.user!.id)
          .eq("requester_user_id", auth.user!.id)
          .gte("created_at", dayStart.toISOString());
        if ((count || 0) + parsed.data.length > placementCap) {
          return NextResponse.json(
            {
              error: "outreach_limit_reached",
              message: `Your ${planKey === "premium" ? "Premium" : planKey === "pro" ? "Pro" : "Core"} plan allows ${placementCap} new placement request${placementCap === 1 ? "" : "s"} per day. Try again tomorrow, or upgrade your plan to send more.`,
              limit: placementCap,
              sent: count || 0,
              plan: planKey,
            },
            { status: 429 },
          );
        }
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

    // Build rows. `baseRows` now keeps the critical ownership columns
    // (artist_slug / venue_user_id / venue_slug / requester_user_id) so
    // the fallback retry still produces rows the subsequent GET can
    // find via its .eq("venue_user_id", auth.user.id) filter. Previously
    // the fallback silently stripped venue_user_id and the placement
    // became invisible on reload.
    // Full row with every column the app understands. The fallback chain
    // below only drops columns the DB specifically complains about, it
    // does not blanket-strip monthly_fee_gbp / qr_enabled / message, which
    // used to cause paid-loan placements to be saved without their £ value.
    const fullRows = parsed.data.map((p) => ({
      id: p.id,
      artist_user_id: artistProfile!.user_id || null,
      artist_slug: artistProfile!.slug,
      venue_user_id: venueProfile!.user_id,
      venue_slug: venueProfile!.slug,
      work_title: p.workTitle,
      work_image: p.workImage || null,
      // Size requested for the primary work. Migration 032 adds the
      // column; retry-strip handles older environments.
      work_size: p.requestedDimensions || null,
      // Additional works sharing the same placement row. Saved into
      // extra_works (migration 027); if the column isn't applied yet
      // the retry logic below strips it gracefully.
      extra_works: Array.isArray(p.extraWorks) && p.extraWorks.length > 0
        ? p.extraWorks.map((w) => ({ title: w.title, image: w.image || null, size: w.size || null }))
        : null,
      venue: venueProfile!.name,
      arrangement_type: p.type,
      revenue_share_percent: p.revenueSharePercent || null,
      monthly_fee_gbp: p.monthlyFeeGbp ?? null,
      qr_enabled: p.qrEnabled ?? true,
      message: p.message || null,
      status: "pending",
      revenue: null,
      notes: p.notes || null,
      requester_user_id: auth.user!.id,
      created_at: new Date().toISOString(),
    }));

    async function insertWithout(drop: string[]) {
      const clean = fullRows.map((row) => {
        const next = { ...row } as Record<string, unknown>;
        for (const k of drop) delete next[k];
        return next;
      });
      return db.from("placements").insert(clean);
    }

    let { error } = await db.from("placements").insert(fullRows);

    // Pattern-match the error message and strip only the columns the DB
    // actually rejected, so we don't silently drop payment info.
    const stripped = new Set<string>();
    const candidates = ["requester_user_id", "venue_slug", "artist_slug", "monthly_fee_gbp", "qr_enabled", "message", "extra_works", "work_size"];
    while (error) {
      const msg = error.message || "";
      const newStrip = candidates.filter((c) => !stripped.has(c) && new RegExp(`\\b${c}\\b`).test(msg));
      if (newStrip.length === 0) break;
      newStrip.forEach((c) => stripped.add(c));
      console.warn(`Placement insert missing columns [${Array.from(stripped).join(", ")}], retrying:`, msg);
      const r = await insertWithout(Array.from(stripped));
      error = r.error;
    }
    if (error) console.warn("Placement insert failed:", error.message);

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
        const termsSummary = (() => {
          const parts: string[] = [];
          const t = parsed.data[0].type;
          const fee = parsed.data[0].monthlyFeeGbp ?? 0;
          const rev = parsed.data[0].revenueSharePercent ?? 0;
          if (t === "revenue_share") parts.push(`Revenue share · ${rev || 0}%`);
          else if (t === "purchase") parts.push("Direct purchase");
          else parts.push("Paid loan");
          if (fee > 0) parts.push(`£${fee}/mo`);
          if (rev > 0 && t !== "revenue_share") parts.push(`${rev}% on QR sales`);
          return parts.join(" · ");
        })();
        const placementUrl = placementIdForLink
          ? `${SITE}/placements/${encodeURIComponent(placementIdForLink)}`
          : `${SITE}/${fromVenue ? "artist-portal" : "venue-portal"}/placements`;

        // If the artist initiated the request, the venue is the recipient,
        // send the polished VenueNewPlacementRequest template. For
        // venue-initiated (artist receives), we don't yet have a matching
        // polished template, so fall back to the legacy helper.
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
          notifyPlacementRequest({
            email: notifyUser.email,
            venueName: venueProfile!.name,
            artistName: artistProfile!.name,
            workTitles: parsed.data.map((p) => p.workTitle),
            arrangementType: parsed.data[0].type,
            revenueSharePercent: parsed.data[0].revenueSharePercent,
            message: parsed.data[0].message,
          }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
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
        const termsSummary = (() => {
          const parts: string[] = [];
          const t = parsed.data[0].type;
          const fee = parsed.data[0].monthlyFeeGbp ?? 0;
          const rev = parsed.data[0].revenueSharePercent ?? 0;
          if (t === "revenue_share") parts.push(`Revenue share · ${rev || 0}%`);
          else if (t === "purchase") parts.push("Direct purchase");
          else parts.push("Paid loan");
          if (fee > 0) parts.push(`£${fee}/mo`);
          if (rev > 0 && t !== "revenue_share") parts.push(`${rev}% on QR sales`);
          return parts.join(" · ");
        })();
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

      let { error: msgErr } = await db.from("messages").insert(extendedMsg);
      if (msgErr) {
        // Retry without message_type/metadata if columns missing
        const retry = await db.from("messages").insert(baseMsg);
        msgErr = retry.error;
      }
      if (msgErr) {
        console.warn("Auto-message on placement skipped:", msgErr.message);
      }
    } catch (err) {
      console.warn("Auto-message on placement skipped:", err);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update placement status (artist or venue)
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

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

    // Fetch the placement (include requester_user_id where available)
    let { data: existing } = await db
      .from("placements")
      .select("artist_user_id, venue_user_id, artist_slug, venue_slug, venue, status, requester_user_id")
      .eq("id", id)
      .single();

    // Retry without requester_user_id / venue_slug if the columns don't exist yet
    if (!existing) {
      const fallback = await db
        .from("placements")
        .select("artist_user_id, venue_user_id, artist_slug, venue, status")
        .eq("id", id)
        .single();
      existing = fallback.data as typeof existing;
    }

    if (!existing) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    const isArtist = existing.artist_user_id === auth.user!.id;
    const isVenue = existing.venue_user_id === auth.user!.id;

    if (!isArtist && !isVenue) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
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
    // If requester_user_id is unknown (legacy row or missing column), we still
    // allow either party to accept, the previous "only venue accepts" fallback
    // was wrong for venue-initiated placements.
    const requesterId = existing.requester_user_id || null;
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

    if (existing.status === "pending" && (status === "active" || status === "declined")) {
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
      // .select() so the response tells us exactly which columns the DB
      // accepted, and we narrow the retry to the column that actually
      // failed rather than blanket-stripping requester_user_id.
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

      let termsSaved = false;
      {
        const { data, error: termsErr } = await db.from("placements").update(termsUpdates).eq("id", id).select("id");
        if (!termsErr && Array.isArray(data) && data.length > 0) {
          termsSaved = true;
        } else if (termsErr) {
          // Retry by progressively stripping columns that the DB doesn't
          // know about. We only drop columns mentioned in the error
          // message, everything else we want to keep trying.
          const msg = String(termsErr.message || "").toLowerCase();
          const safe = { ...termsUpdates };
          if (msg.includes("qr_enabled")) delete safe.qr_enabled;
          if (msg.includes("monthly_fee_gbp")) delete safe.monthly_fee_gbp;
          if (msg.includes("arrangement_type")) delete safe.arrangement_type;
          if (Object.keys(safe).length > 0) {
            const retry = await db.from("placements").update(safe).eq("id", id).select("id");
            if (!retry.error && Array.isArray(retry.data) && retry.data.length > 0) termsSaved = true;
          }
        }
      }

      if (!termsSaved) {
        // We didn't update a single term, reject the counter. Returning
        // success here would leave the user thinking the new offer was
        // sent when the DB actually still holds the old terms.
        console.error("Counter terms update failed for placement", id);
        return NextResponse.json({ error: "Failed to save counter offer" }, { status: 500 });
      }

      // Role flip, write separately so a missing requester_user_id column
      // on older environments doesn't roll back the terms update we just
      // confirmed. Fire-and-forget the retry; the terms are the critical
      // part of the counter.
      {
        const { error: flipErr } = await db
          .from("placements")
          .update({ requester_user_id: auth.user!.id })
          .eq("id", id);
        if (flipErr) {
          console.warn("Counter role-flip failed (requester_user_id):", flipErr.message);
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
          const terms: string[] = [];
          if (counter.arrangementType === "revenue_share" && counter.revenueSharePercent !== undefined) {
            terms.push(`Revenue share: ${counter.revenueSharePercent}% to the venue`);
          } else if (counter.arrangementType === "paid_loan") {
            terms.push("Paid loan arrangement");
          } else if (counter.arrangementType === "free_loan") {
            terms.push("Free loan arrangement");
          } else if (counter.arrangementType === "purchase") {
            terms.push("Purchase arrangement");
          } else if (counter.revenueSharePercent !== undefined) {
            terms.push(`Revenue share: ${counter.revenueSharePercent}%`);
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
      // back to the current timestamp. Accepts any ISO 8601 string;
      // future dates are fine so venues can pre-schedule installs.
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

    let { error } = await db.from("placements").update(updates).eq("id", id);

    // Retry without the new lifecycle / proposal columns if the DB isn't
    // migrated yet (pre-024).
    if (error) {
      const {
        accepted_at: _a,
        scheduled_for: _s,
        installed_at: _i,
        live_from: _l,
        collected_at: _c,
        proposed_stage: _ps,
        proposed_by_user_id: _pbu,
        proposed_at: _pa,
        ...safe
      } = updates as Record<string, unknown>;
      const retry = await db.from("placements").update(safe).eq("id", id);
      error = retry.error;
    }

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update placement" }, { status: 500 });
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
      const becameCollected = existing.status === "active" && stage === "collected";
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
    // placements with a NULL requester_user_id.
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
    // missing requester_user_id AND no recoverable fallback silently
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
                  discoverMoreVenuesUrl: `${SITE}/spaces-looking-for-art`,
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
          let { error: msgErr } = await db.from("messages").insert(extendedMsg);
          if (msgErr) {
            // Fall back without message_type/metadata if columns missing
            const retry = await db.from("messages").insert(baseMsg);
            msgErr = retry.error;
          }
          if (msgErr) {
            console.warn("Auto placement_response message failed:", msgErr.message);
          }
        }
      } catch (err) {
        console.warn("Placement response message skipped:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
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
    // requester_user_id was previously also requested here but some
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

    return NextResponse.json({
      success: true,
      archived: !unarchive,
      id,
    });
  } catch (err) {
    console.error("DELETE /api/placements exception:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
