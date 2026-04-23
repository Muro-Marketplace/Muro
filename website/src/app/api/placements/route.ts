import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { placementSchema, placementUpdateSchema } from "@/lib/validations";
import { notifyPlacementRequest, notifyPlacementResponse } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

// Every handler on this route must read live DB state — not a cached Route
// Handler response. Without this, Next.js was serving a stale GET response
// after a DELETE so the deleted placement reappeared on refresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// One canonical conversation per pair of parties. Historically the
// placement flow created its own `placement-…` thread, which meant an
// artist and venue could end up with TWO chats (a regular DM thread
// and the placement thread) and never realise the other existed. We
// now unify everything into the `dm-…` thread so every message — DMs,
// placement requests, counters, responses — lives in one place.
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

    // Filter out rows the current user has soft-deleted from their own
    // list. The counterparty still sees them (as cancelled / declined)
    // until they also remove them.
    const hiddenFlag = role.type === "artist" ? "hidden_for_artist" : "hidden_for_venue";
    const placements = (data || []).filter((p) => {
      const hidden = (p as Record<string, unknown>)[hiddenFlag];
      return hidden !== true;
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
            // Venue attribution is best-effort — some older events may
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
    //   1. inferredRequesters — the FIRST sender per placement, used
    //      to backfill legacy rows where requester_user_id is NULL.
    //   2. latestCountererByPlacement — the sender of the MOST RECENT
    //      counter message, which is the authoritative current
    //      requester even if the placements.requester_user_id column
    //      never got flipped. This is what prevents a counter-sender
    //      from accepting their own counter offer — the DB column can
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
      //   1. The latest counter message (source of truth — even if the
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
      // signed up yet), we still accept the placement — it's stored with
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
      // the flow can work. `user_id` stays empty — downstream code
      // checks for it before trying to email / notify.
      artistProfile = ap || {
        user_id: "",
        slug: targetArtistSlug,
        name: (targetArtistSlug as string).split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      };
      venueProfile = vp;
    } else {
      // Artist-initiated request: look up venue from venueSlug
      const { data: ap } = await db.from("artist_profiles").select("user_id, slug, name").eq("user_id", auth.user!.id).single();
      if (!ap) return NextResponse.json({ error: "Artist profile not found" }, { status: 400 });

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
    // below only drops columns the DB specifically complains about — it
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
    const candidates = ["requester_user_id", "venue_slug", "artist_slug", "monthly_fee_gbp", "qr_enabled", "message"];
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

      // In-app notification (F9)
      const portalBase = fromVenue ? "/artist-portal" : "/venue-portal";
      const workTitles = parsed.data.map((p) => p.workTitle);
      const workSummary = workTitles.length === 1
        ? workTitles[0]
        : `${workTitles.length} works`;
      const requesterName = fromVenue ? venueProfile!.name : artistProfile!.name;
      createNotification({
        userId: notifyUserId,
        kind: "placement_request",
        title: "New placement request",
        body: `${requesterName} requested a placement for ${workSummary}`,
        link: `${portalBase}/placements`,
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
      // recipient_user_id is nullable — when the artist hasn't signed up
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

    const { id, status, stage, counter, stageDate } = parsed.data;
    if (!status && !stage && !counter) {
      return NextResponse.json({ error: "status, stage, or counter required" }, { status: 400 });
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

    // F39 — approval logic
    // Rules (simple, no legacy fallback pitfall):
    //   1. Block only the requester from accepting their own request.
    //   2. Block a true self-placement (both parties are the same user).
    //   3. Any authenticated party that is NOT the requester may accept/decline.
    // If requester_user_id is unknown (legacy row or missing column), we still
    // allow either party to accept — the previous "only venue accepts" fallback
    // was wrong for venue-initiated placements.
    const requesterId = existing.requester_user_id || null;
    let isRequester = requesterId !== null && requesterId === auth.user!.id;
    const isSelfPlacement =
      !!existing.artist_user_id &&
      !!existing.venue_user_id &&
      existing.artist_user_id === existing.venue_user_id;

    // Belt-and-braces: even if requester_user_id didn't flip on a prior
    // counter (e.g. the column update warned instead of erroring), the
    // most recent counter message carries the counterer's user_id in
    // metadata.requesterUserId. If that matches the current user, they
    // are effectively the current requester and must not accept/decline
    // their own counter.
    if (!isRequester && (status === "active" || status === "declined")) {
      const { data: latestCounter } = await db
        .from("messages")
        .select("metadata")
        .eq("message_type", "placement_request")
        .contains("metadata", { placementId: id, counter: true })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestRequesterFromCounter = (latestCounter?.metadata as Record<string, unknown> | null)?.requesterUserId as string | undefined;
      if (latestRequesterFromCounter && latestRequesterFromCounter === auth.user!.id) {
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

    // Counter offer: revise terms on a still-pending row and hand the
    // "needs to respond" role back to the original requester.
    if (counter) {
      if (existing.status !== "pending") {
        return NextResponse.json({ error: "Can only counter a pending request" }, { status: 400 });
      }
      if (isSelfPlacement) {
        return NextResponse.json({ error: "You cannot counter your own placement" }, { status: 400 });
      }
      if (isRequester) {
        return NextResponse.json({ error: "You cannot counter your own request" }, { status: 400 });
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

      let termsSaved = false;
      {
        const { data, error: termsErr } = await db.from("placements").update(termsUpdates).eq("id", id).select("id");
        if (!termsErr && Array.isArray(data) && data.length > 0) {
          termsSaved = true;
        } else if (termsErr) {
          // Retry by progressively stripping columns that the DB doesn't
          // know about. We only drop columns mentioned in the error
          // message — everything else we want to keep trying.
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
        // We didn't update a single term — reject the counter. Returning
        // success here would leave the user thinking the new offer was
        // sent when the DB actually still holds the old terms.
        console.error("Counter terms update failed for placement", id);
        return NextResponse.json({ error: "Failed to save counter offer" }, { status: 500 });
      }

      // Role flip — write separately so a missing requester_user_id column
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
          } else if (counter.arrangementType === "free_loan") {
            terms.push("Paid loan arrangement");
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
              // Counter flips roles — the counter-er now awaits response.
              requesterUserId: auth.user!.id,
            },
          });

          if (counterpartyUserId) {
            const portalBase = isArtist ? "/venue-portal" : "/artist-portal";
            createNotification({
              userId: counterpartyUserId,
              kind: "placement_request",
              title: "Counter offer received",
              body: `${mine.name} sent revised terms`,
              link: `${portalBase}/messages`,
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn("Counter auto-message skipped:", err);
      }

      return NextResponse.json({ success: true, countered: true });
    }

    // Accept / decline: only block the no-op cases (already in that
    // terminal state). Anything else in flight — pending, countered,
    // mid-update — is fine to respond to. A counter doesn't change
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

    // Stage transitions — once the placement is active, either party can
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

    // On pending → active/declined, notify the requester (fire-and-forget)
    if (
      requesterId &&
      existing.status === "pending" &&
      (status === "active" || status === "declined")
    ) {
      try {
        const { data: { user: requesterUser } } = await db.auth.admin.getUserById(requesterId);
        const { data: artistProfile } = await db
          .from("artist_profiles")
          .select("name")
          .eq("user_id", existing.artist_user_id)
          .single();

        if (requesterUser?.email && artistProfile) {
          notifyPlacementResponse({
            email: requesterUser.email,
            artistName: artistProfile.name,
            venueName: existing.venue || "Venue",
            accepted: status === "active",
          }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
        }

        // In-app notification to the requester
        const portalBase = requesterId === existing.artist_user_id ? "/artist-portal" : "/venue-portal";
        createNotification({
          userId: requesterId,
          kind: status === "active" ? "placement_accepted" : "placement_declined",
          title: status === "active" ? "Placement accepted" : "Placement declined",
          body: `${artistProfile?.name || "Artist"} · ${existing.venue || "Venue"}`,
          link: `${portalBase}/placements`,
        }).catch(() => {});
      } catch (err) {
        console.warn("Response notification skipped:", err);
      }

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
            is_read: false,
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
    // Either the artist on the placement OR the venue can delete it.
    // Previously only the artist was authorised, so venue-side removes
    // silently failed and the row reappeared on reload.
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id, venue_user_id, requester_user_id, status, hidden_for_artist, hidden_for_venue")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    const isArtist = existing.artist_user_id && existing.artist_user_id === auth.user!.id;
    const isVenue = existing.venue_user_id && existing.venue_user_id === auth.user!.id;
    const isRequesterRow = existing.requester_user_id && existing.requester_user_id === auth.user!.id;

    if (!isArtist && !isVenue && !isRequesterRow) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const currentStatus = String(existing.status || "").toLowerCase();
    const alreadyHiddenForOtherParty = isArtist
      ? Boolean(existing.hidden_for_venue)
      : Boolean(existing.hidden_for_artist);
    // Declined rows and rows the other side has also walked away from
    // can be cleaned up entirely — no value keeping them around.
    const shouldHardDelete = currentStatus === "declined" || alreadyHiddenForOtherParty;

    if (!shouldHardDelete) {
      // Soft-delete path: hide from the deleter's list, and if the row
      // was "active" (or still pending) transition it to a cancelled
      // state so the other party sees what happened instead of the
      // placement silently disappearing / lingering as "Active".
      const softUpdates: Record<string, unknown> = {
        ...(isArtist ? { hidden_for_artist: true } : {}),
        ...(isVenue ? { hidden_for_venue: true } : {}),
      };
      const shouldMarkCancelled = currentStatus === "active" || currentStatus === "pending";
      if (shouldMarkCancelled) {
        softUpdates.status = "cancelled";
        softUpdates.cancelled_at = new Date().toISOString();
        softUpdates.cancelled_by_user_id = auth.user!.id;
      }

      let { data: softData, error: softErr } = await db
        .from("placements")
        .update(softUpdates)
        .eq("id", id)
        .select("id");
      // If any of the new columns don't exist in this environment, retry
      // with just the status flip and ignore the hidden flags.
      if (softErr) {
        const msg = String(softErr.message || "").toLowerCase();
        const retryUpdates: Record<string, unknown> = { ...softUpdates };
        if (msg.includes("hidden_for_artist")) delete retryUpdates.hidden_for_artist;
        if (msg.includes("hidden_for_venue")) delete retryUpdates.hidden_for_venue;
        if (msg.includes("cancelled_at")) delete retryUpdates.cancelled_at;
        if (msg.includes("cancelled_by_user_id")) delete retryUpdates.cancelled_by_user_id;
        if (Object.keys(retryUpdates).length > 0) {
          const retry = await db.from("placements").update(retryUpdates).eq("id", id).select("id");
          softErr = retry.error;
          softData = retry.data;
        }
      }

      if (softErr || !softData || softData.length === 0) {
        console.error("Placement soft-delete failed:", softErr);
        return NextResponse.json(
          { error: softErr?.message || "Could not remove the placement" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, soft: true, newStatus: shouldMarkCancelled ? "cancelled" : currentStatus });
    }

    // Hard-delete path — declined rows and rows the other party has
    // already walked from. Clear child / linking rows first so FK
    // RESTRICT constraints can't silently abort the delete and leave
    // the row ghost-visible on reload.
    await Promise.all([
      db.from("placement_records").delete().eq("placement_id", id),
      db.from("placement_photos").delete().eq("placement_id", id),
      db.from("messages")
        .delete()
        .in("message_type", ["placement_request", "placement_response"])
        .contains("metadata", { placementId: id }),
    ]).catch((err) => {
      // Non-fatal: the tables may not exist in every env.
      console.warn("Side-table cleanup for placement", id, "failed:", err);
    });
    // Detach any orders that referenced this placement so the main row
    // can go. We don't want to delete the orders — they're the payment
    // record of truth — but we do need to drop the foreign key link.
    await db.from("orders").update({ placement_id: null }).eq("placement_id", id).then(() => {}, () => {});

    const { data: deleted, error } = await db
      .from("placements")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("Placement DELETE error:", error);
      return NextResponse.json({ error: error.message || "Failed to delete placement" }, { status: 500 });
    }

    if (!deleted || deleted.length === 0) {
      console.warn("Placement DELETE returned no rows for id=", id);
      return NextResponse.json(
        { error: "Delete did not remove any row (possible RLS policy or FK constraint). Check Supabase logs." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, soft: false, deletedId: deleted[0]?.id });
  } catch (err) {
    console.error("DELETE /api/placements exception:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
