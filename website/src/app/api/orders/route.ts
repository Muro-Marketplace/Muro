import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
// Phase 2.3 J1 audit: legacy customer-side shipped/delivered emails
// removed in favour of the dispatcher path (recordOrderEvent). The
// templates themselves stay in the registry for the email-preview
// route and any future legacy webhook fallback.
import { executeTransfer } from "@/lib/stripe-connect";
import { canTransition, type OrderStatus, ORDER_STATUSES } from "@/lib/order-state-machine";
import { assertOrderParty, handleAuthzError } from "@/lib/authz";

// E21. Who may set what. `delivered` is deliberately absent from the seller's
// set: it releases escrow, so the party who gets paid cannot self-attest it.
// `cancelled` is on both because either side may call off an order that has not
// shipped; canTransition still decides whether the move is legal from the
// current status, and both gates must pass.
const SELLER_STATUSES = new Set<string>([
  "artist_notified",
  "awaiting_dispatch",
  "processing",
  "shipped",
  "cancelled",
]);
const BUYER_STATUSES = new Set<string>(["delivered", "disputed", "cancelled"]);
import { recordOrderEvent } from "@/lib/orders/lifecycle";
import { sendEmail } from "@/lib/email/send";
import {
  CustomerOrderStatusUpdate,
  orderStatusText,
} from "@/emails/templates/orders/CustomerOrderStatusUpdate";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// GET: fetch orders for the authenticated user (customer, artist, or venue)
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const email = auth.user!.email || "";
    const userId = auth.user!.id;

    // Check user type
    const { data: artistProfile } = await db.from("artist_profiles").select("slug").eq("user_id", userId).single();
    const { data: venueProfile } = !artistProfile
      ? await db.from("venue_profiles").select("slug").eq("user_id", userId).single()
      : { data: null };

    // Sanitise the email used in the PostgREST .or() filter. The value
    // comes from the authenticated session so it's already been
    // RFC-validated at signup, but RFC 5322 technically allows commas
    // and parens in quoted local-parts and those characters would
    // break the .or() filter syntax. If we see anything unusual we
    // skip the email branch rather than risk a malformed filter.
    const emailSafe = /^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+$/.test(email) ? email : "";

    let query;
    if (artistProfile) {
      // Artist: orders for their work. Match by EITHER artist_user_id
      // OR artist_slug so an order that landed with only one of the
      // two columns populated (e.g. webhook fallback insert that
      // dropped attribution columns, slug renamed, casing drift)
      // still surfaces in the artist's list.
      //
      // E3 (Phase 2.4): also include orders where this artist is the
      // BUYER (artist A purchasing from artist B). Before this clause
      // those purchases lived nowhere in the artist's portal because
      // the artist branch only checked seller-side keys.
      const terms = [
        `artist_user_id.eq.${userId}`,
        `artist_slug.eq.${artistProfile.slug}`,
        `buyer_user_id.eq.${userId}`,
      ];
      if (emailSafe) terms.push(`buyer_email.eq.${emailSafe}`);
      query = db.from("orders").select("*").or(terms.join(","));
    } else if (venueProfile) {
      // Venue: orders from their venue + their own purchases
      const terms = [`venue_slug.eq.${venueProfile.slug}`];
      if (emailSafe) terms.push(`buyer_email.eq.${emailSafe}`);
      query = db.from("orders").select("*").or(terms.join(","));
    } else {
      // Customer: orders by email or user ID
      const terms = [`buyer_user_id.eq.${userId}`];
      if (emailSafe) terms.push(`buyer_email.eq.${emailSafe}`);
      query = db.from("orders").select("*").or(terms.join(","));
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
    }

    // Defensive normalisation: any legacy row where status_history,
    // items, or shipping was stored as a stringified JSON value (older
    // orders from before we corrected the PATCH path) gets parsed back
    // into an object/array so the client can render it without crashing.
    const safeParseArray = (v: unknown) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
      }
      return [];
    };
    const safeParseObject = (v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; }
      }
      return {};
    };
    const orders = (data || []).map((o) => ({
      ...o,
      status_history: safeParseArray((o as { status_history?: unknown }).status_history),
      items: safeParseArray((o as { items?: unknown }).items),
      shipping: safeParseObject((o as { shipping?: unknown }).shipping),
    }));

    return NextResponse.json({
      orders,
      userType: artistProfile ? "artist" : venueProfile ? "venue" : "customer",
      userEmail: email,
      artistSlug: artistProfile?.slug || null,
      venueSlug: venueProfile?.slug || null,
    });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[orders] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update order status (artist fulfillment)
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  try {
    const body = await request.json();
    const { orderId, status, trackingNumber } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: "Order ID and status required" }, { status: 400 });
    }

    if (!ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // E21. Both parties are resolved here, not just the artist. The buyer used
    // to be unauthorised for every status, which left `delivered` self-attested
    // by the party who gets paid by it.
    //
    // assertOrderParty matches the seller on artist_user_id OR artist_slug
    // (legacy rows), and the buyer on buyer_user_id OR buyer_email against the
    // caller's own email. The email arm matters: every one of the 12 live orders
    // has buyer_email and NONE has buyer_user_id, because guest checkout is
    // allowed, so a user-id-only match would have made the buyer role
    // unreachable and stranded orders in `shipped`.
    const order = await assertOrderParty(auth.user!, orderId, { as: "any" }, db);

    // Back-fill the column the legacy slug match papers over, so later updates
    // take the fast path. Only meaningful for a seller on a legacy row.
    if (order.role === "seller" && order.artist_user_id === null) {
      db.from("orders")
        .update({ artist_user_id: auth.user!.id })
        .eq("id", orderId)
        .then(() => {}, () => {});
    }

    // The seller may drive dispatch; only the buyer may confirm the parcel
    // arrived. `delivered` releases every pending stripe_transfers row for the
    // order (see the executeTransfer block below), which is the platform's only
    // chargeback buffer. canTransition blocks confirmed → delivered, but
    // shipped → delivered is a legal edge and shipping is self-attested too, so
    // before this the seller could walk confirmed → processing → shipped →
    // delivered in three requests and be paid on day zero.
    //
    // Support overrides ("the carrier confirmed but the buyer never clicked")
    // go through /api/admin/orders, which is the intended escape hatch.
    const allowed = order.role === "seller" ? SELLER_STATUSES : BUYER_STATUSES;
    if (!allowed.has(status)) {
      return NextResponse.json(
        { error: `A ${order.role} cannot move an order to ${status}.` },
        { status: 403 },
      );
    }

    const transition = canTransition(order.status as OrderStatus, status as OrderStatus);
    if (!transition.ok) {
      return NextResponse.json({ error: transition.reason }, { status: 422 });
    }

    // Append to status history. status_history is JSONB, pass the actual
    // array, never JSON.stringify'd, otherwise the column stores a string
    // and the client crashes when it tries to .find/.map on it. That was
    // the source of the "something went wrong" page on order detail click.
    const rawHistory = order.status_history;
    const parsedHistory = Array.isArray(rawHistory)
      ? rawHistory
      : typeof rawHistory === "string"
        ? (() => { try { const v = JSON.parse(rawHistory); return Array.isArray(v) ? v : []; } catch { return []; } })()
        : [];
    parsedHistory.push({ status, timestamp: new Date().toISOString() });

    const updates: Record<string, unknown> = { status, status_history: parsedHistory };
    if (trackingNumber) updates.tracking_number = trackingNumber;
    // Migration 110. `isRefundEligible` measures the 14-day Consumer Contracts
    // Regulations 2013 window from this timestamp, and nothing ever wrote it on
    // this path: the column did not exist, and the only code that set it at all
    // was the collection branch of the webhook insert, where the D6 ladder
    // stripped it. So `status === "delivered" && delivered_at` was false for
    // every delivered order and the refund affordance never appeared.
    //
    // Only on the transition INTO delivered, and only when it is not already
    // stamped, so a re-PATCH cannot silently restart someone's window.
    if (status === "delivered" && !order.delivered_at) {
      updates.delivered_at = new Date().toISOString();
    }

    const { error } = await db.from("orders").update(updates).eq("id", orderId);

    if (error) {
      console.error("Status update error:", error);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    // J1 (Phase 2.3): log the lifecycle event + fire the Phase 2.0c
    // dispatcher templates. Best-effort. The original branded React
    // Email templates below continue to fire so we don't lose the
    // legacy artwork-thumbnail variant during the cut-over; the
    // dispatcher uses purpose-built Phase 2 templates with a
    // different `to` and idempotency-key shape, so the two paths
    // don't double-charge or double-send.
    try {
      const shippingBlob0 = (order.shipping ?? {}) as { fullName?: string };
      const firstName0 = order.buyer_email
        ? (shippingBlob0.fullName || order.buyer_email.split("@")[0]).split(" ")[0]
        : "there";
      // Look up the artist contact email so order.placed can dispatch
      // to the artist as well. Best-effort, no-op when there's no
      // artist_user_id on the row (legacy / guest-QR orders) — the
      // Supabase admin client throws "Expected parameter to be UUID"
      // for empty strings, which clutters error logs for nothing.
      let artistEmail: string | null = null;
      const artistUserId = (order as { artist_user_id?: string }).artist_user_id ?? "";
      if (artistUserId) {
        try {
          const { data: artist } = await db.auth.admin.getUserById(artistUserId);
          artistEmail = artist?.user?.email ?? null;
        } catch {
          artistEmail = null;
        }
      }
      await recordOrderEvent({
        orderId,
        newStatus: status,
        actorUserId: auth.user?.id ?? null,
        buyerEmail: order.buyer_email ?? null,
        artistEmail,
        data: {
          firstName: firstName0,
          orderNumber: orderId,
          orderUrl: `${SITE}/customer-portal/orders`,
          // 09 item 1.5: the cancellation template needs the verb phrase, and
          // the dispatcher spreads `data` straight into the component.
          statusText: orderStatusText(status),
        },
        metadata: { tracking_number: trackingNumber ?? null },
      });
    } catch (lifecycleErr) {
      console.error("[orders PATCH] lifecycle hook:", lifecycleErr);
    }

    // Phase 2.3 J1 audit fix: the dispatcher above (recordOrderEvent)
    // now owns shipped + delivered + processing customer emails via
    // the Phase 2.0c templates. The old inline sendEmail calls used
    // a different idempotency key shape, so both paths fired and the
    // customer received duplicate messages for the same lifecycle
    // event. This send covers only the statuses the dispatcher doesn't
    // (disputed / refunded), so those notes still go out.
    //
    // K1: that used to be the legacy `notifyBuyerStatusUpdate`, hand-written
    // HTML from an unverified domain with no audit trail. Same scope, one
    // pipeline.
    //
    // Finding 7.3: await the email so it completes before the function
    // returns (Vercel serverless can freeze/kill unawaited promises).
    // A failure is logged but does NOT fail the request — the status
    // change already committed successfully above.
    // `cancelled` is absent from this list on purpose: the dispatcher above owns
    // it since 09 item 1.5. Leaving it here would send two emails for one
    // cancellation, which is the defect K1 removed from refunds/process.
    if (
      order.buyer_email &&
      status !== "shipped" &&
      status !== "delivered" &&
      status !== "processing" &&
      status !== "cancelled"
    ) {
      try {
        const shippingBlob = (order.shipping ?? {}) as { fullName?: string };
        await sendEmail({
          idempotencyKey: `order_status_update:${orderId}:${status}`,
          template: "customer_order_status_update",
          category: "orders_and_payouts",
          to: order.buyer_email,
          subject: `Update on order ${orderId}`,
          react: CustomerOrderStatusUpdate({
            firstName: (shippingBlob.fullName || order.buyer_email.split("@")[0] || "there").split(" ")[0],
            orderNumber: orderId,
            statusText: orderStatusText(status),
            trackingNumber: trackingNumber || undefined,
            orderUrl: `${SITE}/customer-portal/orders`,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { orderId, status },
        });
      } catch (err) {
        console.error("[orders PATCH] status email failed", { orderId, status, err });
      }
    }

    // On delivery, release pending payouts immediately (instead of waiting 14 days)
    // and attribute the venue revenue back to the source placement so venue
    // dashboards see the linkage. Idempotent: status_history is checked before
    // the original update; if "delivered" was already there we skip the bump.
    //
    // Finding 2.2: declared here (outer scope) so the response builder below
    // can read it regardless of whether status === "delivered".
    let payoutFailures = 0;
    if (status === "delivered") {
      const { data: pendingTransfers } = await db
        .from("stripe_transfers")
        .select("id")
        .eq("order_id", orderId)
        .eq("status", "pending");

      // Await each transfer individually so Vercel serverless cannot
      // freeze/kill the payouts before they complete. Per-transfer
      // try/catch means one Stripe failure does not abort remaining transfers.
      // On failure: the row stays 'pending'. The cron processPendingTransfers
      // picks up rows whose payout_after <= now(), so for shipped orders
      // (payout_after is ~14 days out) a failed early payout is not retried
      // promptly — it will be retried only once the original hold period
      // expires (up to ~14 days later). Do NOT write any other status on
      // failure — that would permanently block re-execution.
      if (pendingTransfers) {
        for (const t of pendingTransfers) {
          try {
            await executeTransfer(t.id);
          } catch (err) {
            console.error("[orders PATCH] early payout failed", { transferId: t.id, orderId, err });
            payoutFailures += 1;
          }
        }
      }

      // Placement-revenue attribution. Only fires on the first delivered
      // transition (rawHistory was the pre-update snapshot, so an existing
      // "delivered" entry there means we've already counted this order).
      const alreadyDelivered = parsedHistory
        .slice(0, -1)
        .some((h: { status?: string }) => h?.status === "delivered");
      if (!alreadyDelivered && order.placement_id && order.venue_revenue) {
        const { error: rpcErr } = await db.rpc("increment_placement_revenue", {
          p_placement_id: order.placement_id,
          p_amount: order.venue_revenue,
        });
        if (rpcErr) console.error("Failed to attribute placement revenue:", rpcErr);
      }
    }

    // On cancellation, cancel pending payouts
    if (status === "cancelled") {
      await db
        .from("stripe_transfers")
        .update({ status: "cancelled" })
        .eq("order_id", orderId)
        .eq("status", "pending");
    }

    // Surface early-payout failures so callers and monitoring can see
    // them. The order-status change itself succeeded (200), but include
    // the count so dashboards/alerts can track partial payout failures.
    // The field is omitted when payoutFailures is 0 to keep the common
    // path response shape identical to the pre-fix shape.
    const responseBody: { success: true; payoutFailures?: number } = { success: true };
    if (payoutFailures > 0) responseBody.payoutFailures = payoutFailures;
    return NextResponse.json(responseBody);
  } catch (err) {
    // E21 routes denials through AuthzError; without this the bare catch would
    // flatten a 404 order_not_found into whatever this handler returns.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    // Logged, not swallowed: a real fault here used to be
    // indistinguishable from a malformed body (Phase E item 14).
    console.error("[orders] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
