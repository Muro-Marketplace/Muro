// /api/offers/[id]
//
// PATCH — accept / decline / withdraw an offer.
// GET — fetch a single offer (must be a party to it).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

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
      notifyTitle = `Offer accepted — £${(offer.amount_pence / 100).toFixed(2)}`;
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

    // Drop a status-change line into the conversation thread so the
    // negotiation reads as one continuous chat rather than disjointed
    // bell notifications. Best-effort — don't block the response.
    try {
      const [{ data: artistRow }, { data: venueRow }] = await Promise.all([
        db.from("artist_profiles").select("slug").eq("user_id", offer.artist_user_id).maybeSingle<{ slug: string | null }>(),
        db.from("venue_profiles").select("slug").eq("user_id", offer.buyer_user_id).maybeSingle<{ slug: string | null }>(),
      ]);
      const artistSlug = artistRow?.slug;
      const venueSlug = venueRow?.slug;
      if (artistSlug && venueSlug) {
        const [a, b] = [artistSlug, venueSlug].sort();
        const conversationId = `dm-${a}__${b}`;
        const formatted = `£${(offer.amount_pence / 100).toFixed(2)}`;
        const senderIsArtist = me === offer.artist_user_id;
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
  }

  return NextResponse.json({ success: true, status: newStatus });
}
