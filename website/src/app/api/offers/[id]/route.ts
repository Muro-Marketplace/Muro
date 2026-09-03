// /api/offers/[id]
//
// PATCH — accept / decline / withdraw an offer.
// GET — fetch a single offer (must be a party to it).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createNotification } from "@/lib/notifications";
import { formatOfferDeadline, isOfferLapsed } from "@/lib/offers/expiry";
import { sendEmail } from "@/lib/email/send";
import { OfferOutcomeNotification } from "@/emails/templates/messages/OfferOutcomeNotification";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/**
 * What the offer was on, for the outcome email: a collection name, a single
 * work title, or "<title> and N more". Null when it cannot be resolved; the
 * email reads fine without it and a lookup failure must not stop the send.
 */
async function offerItemTitle(
  db: ReturnType<typeof getSupabaseAdmin>,
  offer: { collection_id?: string | null; work_ids?: string[] | null },
): Promise<string | null> {
  try {
    if (offer.collection_id) {
      const { data } = await db
        .from("artist_collections")
        .select("name")
        .eq("id", offer.collection_id)
        .maybeSingle<{ name: string | null }>();
      return data?.name?.trim() || null;
    }
    const ids = Array.isArray(offer.work_ids) ? offer.work_ids : [];
    if (ids.length === 0) return null;
    const { data } = await db.from("artist_works").select("title").in("id", ids);
    const titles = ((data || []) as Array<{ title: string | null }>)
      .map((w) => (w.title || "").trim())
      .filter(Boolean);
    if (titles.length === 0) return null;
    return titles.length === 1 ? titles[0] : `${titles[0]} and ${titles.length - 1} more`;
  } catch {
    return null;
  }
}

const patchSchema = z.object({
  action: z.enum(["accept", "decline", "withdraw"]),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: offer } = await db.from("purchase_offers").select("*").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (offer.buyer_user_id !== auth.user!.id && offer.artist_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  return NextResponse.json({ offer });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: offer } = await db.from("purchase_offers").select("*").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = auth.user!.id;
  const isBuyer = offer.buyer_user_id === me;
  const isArtist = offer.artist_user_id === me;
  if (!isBuyer && !isArtist) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  if (offer.status !== "pending" && offer.status !== "countered") {
    return NextResponse.json({ error: "Offer is no longer open" }, { status: 409 });
  }

  // F41. `expires_at` has been stored and typed since the create route accepted
  // an `expiresAt` field, and no handler ever read it: an offer whose deadline
  // passed months ago still accepted, and an accept is precisely what makes the
  // row payable. Withdraw is deliberately still allowed — the sender pulling
  // back a lapsed offer is tidying up, not acting on stale terms.
  if (parsed.data.action !== "withdraw" && isOfferLapsed(offer)) {
    // Close the row so it stops presenting as live on both portals and in the
    // thread card. Compare-and-set on the status we read, so a concurrent
    // accept or payment is never overwritten by this bookkeeping write — the
    // same shape the checkout's stock guard uses.
    await db
      .from("purchase_offers")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", offer.status);
    return NextResponse.json(
      {
        error: "This offer has passed its deadline and is no longer open.",
        code: "offer_expired",
      },
      { status: 409 },
    );
  }

  let newStatus: string;
  let notifyRecipient: string | null = null;
  let notifyTitle = "";
  let notifyKind = "";

  // Whoever didn't *send* this row is the recipient — and only the
  // recipient may accept/decline. Earlier we hard-coded "artist only"
  // which broke the venue's path on a counter offer (artist countered
  // → venue is now the recipient, but the API rejected venue's accept).
  const senderId = offer.created_by_user_id || offer.buyer_user_id;
  const isRecipient = me !== senderId;
  switch (parsed.data.action) {
    case "accept":
      if (!isRecipient) {
        return NextResponse.json(
          { error: "Only the recipient of this offer can accept it" },
          { status: 403 },
        );
      }
      newStatus = "accepted";
      // After accept, the venue is the side that pays — notify them
      // regardless of who accepted (artist accepted venue's price OR
      // venue accepted artist's counter price → venue still pays).
      notifyRecipient = offer.buyer_user_id;
      notifyTitle = `Offer accepted, £${(offer.amount_pence / 100).toFixed(2)}`;
      notifyKind = "offer_accepted";
      break;
    case "decline":
      if (!isRecipient) {
        return NextResponse.json(
          { error: "Only the recipient of this offer can decline it" },
          { status: 403 },
        );
      }
      newStatus = "declined";
      // Notify the *sender* of the row that was declined (other side).
      notifyRecipient = senderId;
      notifyTitle = `Offer declined`;
      notifyKind = "offer_declined";
      break;
    case "withdraw": {
      // Either side can withdraw — but only their own offer/counter.
      // We use created_by_user_id to identify the sender of this row.
      const senderId = offer.created_by_user_id || offer.buyer_user_id;
      if (me !== senderId) {
        return NextResponse.json(
          { error: "Only the sender of this offer can withdraw it" },
          { status: 403 },
        );
      }
      newStatus = "withdrawn";
      notifyRecipient = me === offer.buyer_user_id ? offer.artist_user_id : offer.buyer_user_id;
      notifyTitle = `Offer withdrawn`;
      notifyKind = "offer_withdrawn";
      break;
    }
  }

  const { error } = await db.from("purchase_offers")
    .update({
      status: newStatus,
      accepted_at: newStatus === "accepted" ? new Date().toISOString() : offer.accepted_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("[offers PATCH]", error);
    return NextResponse.json({ error: "Could not update offer" }, { status: 500 });
  }

  if (notifyRecipient) {
    // Recipient-side portal link. Offers are venue-only on the buy
    // side, so the buyer always lands at /venue-portal/offers; the
    // artist always at /artist-portal/offers.
    //
    // On accept specifically, append ?pay=<offerId> so the venue
    // portal auto-fires the Stripe checkout redirect on mount —
    // tapping the bell goes straight to the payment page rather than
    // making the buyer hunt for a "Complete payment" button.
    const isBuyerRecipient = notifyRecipient === offer.buyer_user_id;
    const basePath = isBuyerRecipient ? "/venue-portal/offers" : "/artist-portal/offers";
    const recipientLink = newStatus === "accepted" && isBuyerRecipient
      ? `${basePath}?pay=${encodeURIComponent(id)}`
      : basePath;
    createNotification({
      userId: notifyRecipient,
      kind: notifyKind,
      title: notifyTitle,
      body: newStatus === "accepted"
        ? "Tap to complete checkout."
        : newStatus === "declined"
          ? "Make a new offer if you'd like to revise."
          : "The buyer has withdrawn this offer.",
      link: recipientLink,
    }).catch((err) => console.warn("[offers] bell failed:", err));

    // Names and slugs for the thread line and the email below. Best-effort:
    // a missing profile must not fail a status change already committed.
    let artistSlug: string | null = null;
    let venueSlug: string | null = null;
    let artistName: string | null = null;
    let venueName: string | null = null;
    try {
      const [{ data: artistRow }, { data: venueRow }] = await Promise.all([
        db.from("artist_profiles").select("slug, name").eq("user_id", offer.artist_user_id).maybeSingle<{ slug: string | null; name: string | null }>(),
        db.from("venue_profiles").select("slug, name").eq("user_id", offer.buyer_user_id).maybeSingle<{ slug: string | null; name: string | null }>(),
      ]);
      artistSlug = artistRow?.slug ?? null;
      venueSlug = venueRow?.slug ?? null;
      artistName = artistRow?.name ?? null;
      venueName = venueRow?.name ?? null;
    } catch (err) {
      console.warn("[offers] profile lookup skipped:", err);
    }
    const formatted = `£${(offer.amount_pence / 100).toFixed(2)}`;
    const senderIsArtist = me === offer.artist_user_id;

    // Drop a status-change line into the conversation thread so the
    // negotiation reads as one continuous chat rather than disjointed
    // bell notifications. Best-effort — don't block the response.
    try {
      if (artistSlug && venueSlug) {
        const [a, b] = [artistSlug, venueSlug].sort();
        const conversationId = `dm-${a}__${b}`;
        const senderSlug = senderIsArtist ? artistSlug : venueSlug;
        const recipientSlug = senderIsArtist ? venueSlug : artistSlug;
        const summary = newStatus === "accepted"
          ? `Accepted the offer of ${formatted}.`
          : newStatus === "declined"
            ? `Declined the offer of ${formatted}.`
            : `Withdrew the offer of ${formatted}.`;
        await db.from("messages").insert({
          conversation_id: conversationId,
          sender_id: me,
          sender_name: senderSlug,
          sender_type: senderIsArtist ? "artist" : "venue",
          recipient_slug: recipientSlug,
          recipient_user_id: notifyRecipient,
          content: summary,
          is_read: false,
          created_at: new Date().toISOString(),
          message_type: "purchase_offer_status",
          metadata: {
            offerId: id,
            offerStatus: newStatus,
            formattedAmount: formatted,
          },
        });
      }
    } catch (err) {
      console.warn("[offers] thread message skipped:", err);
    }

    // Email the counterparty of whoever acted. Until now the outcome of an
    // offer reached them as a bell and a thread line only, while the venue
    // whose offer was accepted has a payment step to complete. Money, so it
    // goes out as orders_and_payouts (the offer that opened the negotiation
    // already does, via TEMPLATE_CATEGORY_OVERRIDES). The status gate above
    // means a row enters each outcome once, so the key is the row, the
    // outcome and the recipient. Best-effort, like the thread line: the
    // status change is already committed.
    const counterpartyUserId: string = senderIsArtist ? offer.buyer_user_id : offer.artist_user_id;
    try {
      const { data: { user: recipientUser } } = await db.auth.admin.getUserById(counterpartyUserId);
      if (recipientUser?.email) {
        const recipientIsArtist = counterpartyUserId === offer.artist_user_id;
        const recipientName = recipientIsArtist ? artistName : venueName;
        const firstName =
          (recipientUser.user_metadata?.first_name as string | undefined) ||
          (recipientName || "").split(" ")[0] ||
          ((recipientUser.user_metadata?.display_name as string | undefined) || "").split(" ")[0] ||
          recipientUser.email.split("@")[0];
        const counterpartyName = senderIsArtist ? artistName || "The artist" : venueName || "The venue";
        const outcome = newStatus as "accepted" | "declined" | "withdrawn";
        const isCounter = !!offer.parent_offer_id;
        const noun = isCounter ? "counter offer" : "offer";
        const subject =
          outcome === "accepted"
            ? `${counterpartyName} accepted your ${noun} of ${formatted}`
            : outcome === "declined"
              ? `${counterpartyName} declined your ${noun} of ${formatted}`
              : `${counterpartyName} withdrew their ${noun} of ${formatted}`;
        const offersPath = recipientIsArtist ? "/artist-portal/offers" : "/venue-portal/offers";
        const itemTitle = await offerItemTitle(db, offer);
        await sendEmail({
          idempotencyKey: `offer_outcome:${id}:${outcome}:${counterpartyUserId}`,
          template: "offer_outcome_notification",
          category: "orders_and_payouts",
          to: recipientUser.email,
          subject,
          userId: counterpartyUserId,
          react: OfferOutcomeNotification({
            firstName,
            recipientRole: recipientIsArtist ? "artist" : "venue",
            counterpartyName,
            formattedAmount: formatted,
            outcome,
            isCounter,
            itemTitle: itemTitle ?? undefined,
            offersUrl: `${SITE}${offersPath}?focus=${encodeURIComponent(id)}`,
            // The same deep link the bell uses: the venue portal fires the
            // Stripe checkout on mount for ?pay=<offerId>.
            paymentUrl:
              outcome === "accepted" && !recipientIsArtist
                ? `${SITE}/venue-portal/offers?pay=${encodeURIComponent(id)}`
                : undefined,
            // purchase_offers.expires_at, the deadline the offers list shows
            // as "Expires <date>".
            offerDeadline: formatOfferDeadline(offer) ?? undefined,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { offerId: id, outcome },
        });
      }
    } catch (err) {
      console.warn("[offers] outcome email skipped:", err);
    }
  }

  return NextResponse.json({ success: true, status: newStatus });
}
