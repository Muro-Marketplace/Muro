// /api/offers — purchase offers on works and collections.
//
// GET — list the caller's offers (as buyer or artist).
// POST — create a new offer or counter an existing one.
//
// Status flow: pending → accepted | declined | countered | expired | withdrawn
// After acceptance: → paid (Stripe webhook flips this once the buyer
// completes checkout via /api/offers/[id]/checkout).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { OfferReceivedNotification } from "@/emails/templates/messages/OfferReceivedNotification";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

const createSchema = z.object({
  artistSlug: z.string().min(1),
  workIds: z.array(z.string()).default([]),
  collectionId: z.string().optional(),
  amountPence: z.number().int().positive().max(50_000_000), // £500k cap, enough for any artwork
  // Optional size label for single-work offers — when present, the
  // 60% floor compares against this size's price specifically rather
  // than the largest size on the work.
  sizeLabel: z.string().max(120).optional(),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
  parentOfferId: z.string().optional(),
});

type DbWorkRow = {
  id: string;
  pricing: Array<{ label: string; price: number }> | null;
};

/**
 * Compute the "asking price" used to enforce the 60% offer floor.
 * For works: sum of the largest size price per work. For collections:
 * sum of all collection items' largest sizes.
 *
 * Returns `null` if we can't determine a price (in which case the
 * caller should let the offer through — the artist can still decline).
 */
async function computeAskingPricePence(
  db: ReturnType<typeof getSupabaseAdmin>,
  target: { workIds: string[]; collectionId?: string | null; sizeLabel?: string },
): Promise<number | null> {
  let workIds = target.workIds;
  if (target.collectionId) {
    const { data: collection } = await db
      .from("artist_collections")
      .select("work_ids")
      .eq("id", target.collectionId)
      .maybeSingle<{ work_ids: string[] | null }>();
    if (!collection?.work_ids?.length) return null;
    workIds = collection.work_ids;
  }
  if (workIds.length === 0) return null;

  const { data: works } = await db
    .from("artist_works")
    .select("id, pricing")
    .in("id", workIds);
  if (!works || works.length === 0) return null;

  // Single-work offers can pin against a specific size variant the
  // buyer chose on the artwork page. Multi-work / collection offers
  // fall back to summing the largest price per work — the most
  // permissive 60% floor.
  const useLabel = target.sizeLabel && workIds.length === 1;
  const labelLower = (target.sizeLabel || "").toLowerCase();

  let totalPence = 0;
  let priced = 0;
  for (const w of works as DbWorkRow[]) {
    const tiers = Array.isArray(w.pricing) ? w.pricing : [];
    if (tiers.length === 0) continue;
    let chosenPrice: number | null = null;
    if (useLabel) {
      const match = tiers.find((t) => (t.label || "").toLowerCase() === labelLower);
      if (match && Number.isFinite(Number(match.price))) {
        chosenPrice = Number(match.price);
      }
    }
    if (chosenPrice == null) {
      chosenPrice = Math.max(...tiers.map((t) => Number(t.price) || 0));
    }
    if (chosenPrice > 0) {
      totalPence += Math.round(chosenPrice * 100);
      priced++;
    }
  }
  return priced > 0 ? totalPence : null;
}

type DbOffer = {
  id: string;
  buyer_user_id: string;
  buyer_type: "customer" | "venue";
  artist_user_id: string;
  artist_slug: string | null;
  work_ids: string[];
  collection_id: string | null;
  amount_pence: number;
  currency: string;
  message: string | null;
  status: string;
  conversation_id: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  paid_order_id: string | null;
  parent_offer_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const role = url.searchParams.get("role"); // 'buyer' | 'artist' | null (both)

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  let query = db.from("purchase_offers").select("*").order("created_at", { ascending: false });
  if (role === "buyer") {
    query = query.eq("buyer_user_id", userId);
  } else if (role === "artist") {
    query = query.eq("artist_user_id", userId);
  } else {
    query = query.or(`buyer_user_id.eq.${userId},artist_user_id.eq.${userId}`);
  }
  const { data, error } = await query.limit(200);
  if (error) {
    console.error("[offers GET]", error);
    return NextResponse.json({ error: "Could not load offers" }, { status: 500 });
  }
  const offers = (data || []) as DbOffer[];

  // Enrich with the buyer-side artwork + venue details so the offers
  // list page can show actual context (image, title, dimensions, venue
  // name) rather than just "1 work · from venue".
  const allWorkIds = Array.from(new Set(offers.flatMap((o) => o.work_ids || [])));
  const collectionIds = Array.from(new Set(offers.map((o) => o.collection_id).filter((x): x is string => !!x)));
  const venueIds = Array.from(new Set(offers.map((o) => o.buyer_user_id)));
  const artistSlugs = Array.from(new Set(offers.map((o) => o.artist_slug).filter((x): x is string => !!x)));

  const [worksRes, collectionsRes, venuesRes, artistsRes] = await Promise.all([
    allWorkIds.length
      ? db.from("artist_works").select("id, title, image, dimensions, medium").in("id", allWorkIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; image: string | null; dimensions: string | null; medium: string | null }> }),
    collectionIds.length
      ? db.from("artist_collections").select("id, title, work_ids").in("id", collectionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; work_ids: string[] | null }> }),
    venueIds.length
      ? db.from("venue_profiles").select("user_id, name, slug, location").in("user_id", venueIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; name: string; slug: string | null; location: string | null }> }),
    artistSlugs.length
      ? db.from("artist_profiles").select("slug, name").in("slug", artistSlugs)
      : Promise.resolve({ data: [] as Array<{ slug: string; name: string }> }),
  ]);

  const workById = new Map((worksRes.data || []).map((w) => [w.id, w]));
  const collectionById = new Map((collectionsRes.data || []).map((c) => [c.id, c]));
  const venueByUserId = new Map((venuesRes.data || []).map((v) => [v.user_id, v]));
  const artistBySlug = new Map((artistsRes.data || []).map((a) => [a.slug, a]));

  const enriched = offers.map((o) => ({
    ...o,
    works: (o.work_ids || []).map((id) => workById.get(id)).filter(Boolean),
    collection: o.collection_id ? collectionById.get(o.collection_id) ?? null : null,
    venue: venueByUserId.get(o.buyer_user_id) ?? null,
    artist: o.artist_slug ? artistBySlug.get(o.artist_slug) ?? null : null,
  }));

  return NextResponse.json({ offers: enriched });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid offer" }, { status: 400 });
  }

  const { artistSlug, workIds, collectionId, amountPence, sizeLabel, message, expiresAt, parentOfferId } = parsed.data;

  if ((workIds.length === 0 && !collectionId) || (workIds.length > 0 && collectionId)) {
    return NextResponse.json({ error: "Provide either workIds or a collectionId" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const buyerId = auth.user!.id;

  // VENUE-ONLY GATE. Customers cannot make purchase offers; artists
  // can only respond to offers they receive (via PATCH on existing
  // rows or via artwork-request-responses).
  const { data: venueProfile } = await db
    .from("venue_profiles")
    .select("user_id, slug")
    .eq("user_id", buyerId)
    .maybeSingle();

  // Allow the artist to counter their own thread (parentOfferId set), but
  // block any non-venue, non-artist initiator.
  const isArtistCountering = !!parentOfferId;
  if (!venueProfile && !isArtistCountering) {
    return NextResponse.json(
      {
        error: "venue_only",
        message:
          "Make-an-Offer is currently available to venues only. " +
          "If you're a customer, please complete a standard purchase via the artwork page.",
      },
      { status: 403 },
    );
  }

  const buyerType: "customer" | "venue" = venueProfile ? "venue" : "customer";

  // Resolve artist by slug.
  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("user_id, name")
    .eq("slug", artistSlug)
    .maybeSingle();
  if (!artistProfile) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  // Minimum-offer check — venues can offer at most 40% below the asking
  // price. The asking price is the sum of the listed prices for the
  // works in workIds, OR for the collection (sum of items inside).
  // Counters from the artist side aren't subject to this floor — they
  // can negotiate freely on their own work.
  if (!isArtistCountering) {
    const askingPence = await computeAskingPricePence(db, { workIds, collectionId, sizeLabel });
    if (askingPence != null) {
      const floor = Math.ceil(askingPence * 0.60);
      if (amountPence < floor) {
        return NextResponse.json(
          {
            error: "below_minimum_offer",
            message: `Offers can be up to 40% below the listed price. The minimum for this is £${(floor / 100).toFixed(2)}.`,
            minimumPence: floor,
            askingPence,
          },
          { status: 400 },
        );
      }
    }
  }

  // Counter — server-side check that the parent exists, the caller is a
  // party to it, and it's still pending.
  let parentRow: {
    buyer_user_id: string;
    buyer_type: "customer" | "venue";
    buyer_email: string | null;
    artist_user_id: string;
    artist_slug: string | null;
    status: string;
  } | null = null;
  if (parentOfferId) {
    const { data: parent } = await db
      .from("purchase_offers")
      .select("buyer_user_id, buyer_type, buyer_email, artist_user_id, artist_slug, status")
      .eq("id", parentOfferId)
      .maybeSingle();
    if (!parent || (parent.buyer_user_id !== buyerId && parent.artist_user_id !== buyerId)) {
      return NextResponse.json({ error: "Cannot counter this offer" }, { status: 403 });
    }
    if (parent.status !== "pending" && parent.status !== "countered") {
      return NextResponse.json({ error: "Offer is no longer open" }, { status: 409 });
    }
    parentRow = parent;
    // Mark the parent as countered. The new row becomes the live one.
    await db.from("purchase_offers")
      .update({ status: "countered", updated_at: new Date().toISOString() })
      .eq("id", parentOfferId);
  }

  const id = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // For counters, the buyer/artist on the row are inherited from the
  // parent so a chain of counters always points at the same two
  // parties. Earlier this stored `buyer_user_id = actor`, which broke
  // when an artist countered (their counter row stored *them* as the
  // buyer). created_by_user_id captures who *sent* this row.
  const row = {
    id,
    buyer_user_id: parentRow ? parentRow.buyer_user_id : buyerId,
    buyer_type: parentRow ? parentRow.buyer_type : buyerType,
    buyer_email: parentRow ? parentRow.buyer_email : auth.user!.email || null,
    artist_user_id: artistProfile.user_id,
    artist_slug: artistSlug,
    work_ids: workIds,
    collection_id: collectionId || null,
    amount_pence: amountPence,
    currency: "GBP",
    message: message || null,
    status: "pending",
    expires_at: expiresAt || null,
    parent_offer_id: parentOfferId || null,
    created_by_user_id: buyerId,
  };

  const { error } = await db.from("purchase_offers").insert(row);
  if (error) {
    console.error("[offers POST]", error);
    return NextResponse.json({ error: "Could not save offer" }, { status: 500 });
  }

  // Notify the recipient (artist on initial, buyer on counter).
  const recipientId = parentOfferId
    ? (await db.from("purchase_offers").select("buyer_user_id, artist_user_id").eq("id", parentOfferId).single()).data
    : { artist_user_id: artistProfile.user_id, buyer_user_id: buyerId };
  if (recipientId) {
    const recipient = recipientId.buyer_user_id === buyerId ? recipientId.artist_user_id : recipientId.buyer_user_id;
    if (recipient) {
      const formatted = `£${(amountPence / 100).toFixed(2)}`;
      // Resolve the actor's display name once — used both in the
      // thread message metadata and the email subject. Looking up
      // the actor's profile up here means we don't have to query
      // again inside the email block.
      const actorIsVenue = buyerId === recipientId.buyer_user_id;
      const senderName = actorIsVenue
        ? (await db.from("venue_profiles").select("name").eq("user_id", buyerId).maybeSingle<{ name: string | null }>())
            .data?.name || "A venue"
        : (await db.from("artist_profiles").select("name").eq("user_id", buyerId).maybeSingle<{ name: string | null }>())
            .data?.name || "An artist";
      // Recipient-side portal link. Buyer is always a venue (offers are
      // venue-only), so a venue recipient → /venue-portal/offers, an
      // artist recipient → /artist-portal/offers. The previous
      // implementation keyed off the *actor's* role and broke when an
      // artist countered.
      const link = recipient === artistProfile.user_id
        ? "/artist-portal/offers"
        : "/venue-portal/offers";
      createNotification({
        userId: recipient,
        kind: parentOfferId ? "offer_counter" : "offer_received",
        title: parentOfferId ? `Counter offer — ${formatted}` : `New offer — ${formatted}`,
        body: message ? message.slice(0, 140) : "Tap to review",
        link,
      }).catch((err) => console.warn("[offers] bell failed:", err));

      // Drop a "you have an offer" message into the artist↔venue
      // conversation thread as a *purchase_offer* card with rich
      // metadata. The MessageInbox renders these as a structured card
      // with image, title, sizes, and inline Accept / Counter /
      // Decline buttons so the recipient can act without leaving the
      // thread. Best-effort — we don't 500 if the insert fails.
      try {
        const { data: venueRow } = await db
          .from("venue_profiles")
          .select("slug, name")
          .eq("user_id", recipientId.buyer_user_id)
          .maybeSingle<{ slug: string | null; name: string | null }>();
        const buyerSlug = venueRow?.slug;
        if (buyerSlug && artistSlug) {
          const [a, b] = [buyerSlug, artistSlug].sort();
          const conversationId = `dm-${a}__${b}`;
          const senderSlug = buyerId === recipientId.buyer_user_id ? buyerSlug : artistSlug;
          const recipientSlug = buyerId === recipientId.buyer_user_id ? artistSlug : buyerSlug;
          const senderType = buyerId === recipientId.buyer_user_id ? "venue" : "artist";

          // Look up the work / collection details so the message
          // card can show what's actually being offered on instead of
          // just an amount line.
          let workDetails: Array<{ id: string; title: string; image: string | null; medium: string | null; dimensions: string | null }> = [];
          let collectionTitle: string | null = null;
          if (workIds.length > 0) {
            const { data: works } = await db
              .from("artist_works")
              .select("id, title, image, medium, dimensions")
              .in("id", workIds);
            workDetails = (works || []) as typeof workDetails;
          }
          if (collectionId) {
            const { data: collection } = await db
              .from("artist_collections")
              .select("title")
              .eq("id", collectionId)
              .maybeSingle<{ title: string | null }>();
            collectionTitle = collection?.title ?? null;
          }

          const primary = workDetails[0];
          const summary = parentOfferId
            ? `Sent a counter offer of ${formatted}.`
            : `Made an offer of ${formatted}${message ? ` — "${message.slice(0, 200)}"` : ""}.`;

          await db.from("messages").insert({
            conversation_id: conversationId,
            sender_id: buyerId,
            sender_name: senderSlug,
            sender_type: senderType,
            recipient_slug: recipientSlug,
            recipient_user_id: recipient,
            content: summary,
            // Unread so the conversation surfaces in the inbox.
            is_read: false,
            created_at: new Date().toISOString(),
            message_type: "purchase_offer",
            metadata: {
              offerId: id,
              offerAmountPence: amountPence,
              formattedAmount: formatted,
              isCounter: !!parentOfferId,
              parentOfferId: parentOfferId || null,
              senderUserId: buyerId,
              recipientUserId: recipient,
              senderName,
              workIds,
              workTitles: workDetails.map((w) => w.title),
              workImages: workDetails.map((w) => w.image).filter((x): x is string => !!x),
              primaryImage: primary?.image || null,
              primaryTitle: collectionTitle || primary?.title || (workIds.length > 1 ? `${workIds.length} works` : "Artwork"),
              primaryDimensions: primary?.dimensions || null,
              primaryMedium: primary?.medium || null,
              sizeLabel: sizeLabel || null,
              collectionId: collectionId || null,
              collectionTitle,
              note: message || null,
            },
          });
        }
      } catch (err) {
        console.warn("[offers] thread message skipped:", err);
      }

      // Email the recipient with the dedicated offer template.
      // Previously this reused ReviewPostedNotification with a fake
      // 5-star rating, which read as nonsense.
      //
      // The sender shown in the email is the *actor*, not always the
      // venue — when the artist counters, the venue receives an email
      // saying "Maya sent a counter offer", not "venue sent a counter".
      try {
        const { data: { user: target } } = await db.auth.admin.getUserById(recipient);
        if (target?.email) {
          const firstName = (
            (target.user_metadata?.display_name as string | undefined) ||
            target.email.split("@")[0]
          ).split(" ")[0];
          // senderName resolved once above; reuse it here.
          const subjectLine = parentOfferId
            ? `Counter offer of ${formatted} from ${senderName}`
            : `New offer of ${formatted} from ${senderName}`;
          const recipientIsArtist = recipient === artistProfile.user_id;
          // Email CTA points at the recipient's offers portal with a
          // ?focus=<offerId> hash so the list can highlight / scroll
          // to the right row instead of dumping the recipient on a
          // generic list page.
          const emailOffersUrl = `${SITE}${link}?focus=${encodeURIComponent(id)}`;
          await sendEmail({
            idempotencyKey: `offer:${id}:${recipient}`,
            template: "offer_received",
            category: "placements",
            to: target.email,
            subject: subjectLine,
            userId: recipient,
            react: OfferReceivedNotification({
              firstName,
              venueName: senderName,
              formattedAmount: formatted,
              message: message || undefined,
              isCounter: !!parentOfferId,
              offersUrl: emailOffersUrl,
              recipientRole: recipientIsArtist ? "artist" : "venue",
              supportUrl: "https://wallplace.co.uk/support",
            }),
            metadata: { offerId: id },
          });
        }
      } catch (err) {
        console.warn("[offers] email skipped:", err);
      }
    }
  }

  // Re-read to return the canonical row.
  const { data: created } = await db.from("purchase_offers").select("*").eq("id", id).single();
  return NextResponse.json({ success: true, offer: created as DbOffer });
}
