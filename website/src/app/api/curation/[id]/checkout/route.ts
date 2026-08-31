// Wallplace Programmes, Task 4. The requester's half of quoted checkout. Once
// an admin has written a quote onto the row (../../../admin/curation/quote
// /route.ts), the requester gets an emailed link that lands here. There is no
// fixed Stripe price to check out against — every programme is quoted
// individually (curation-tiers.ts) — so the session is built from price_data
// at the amount the admin quoted, the same dynamic-price pattern
// src/app/api/placements/[id]/payment/setup/route.ts uses for the paid-loan
// monthly fee.
//
// GET is the entry point an email Button can be a plain link to: it builds
// the session and 303-redirects straight to Stripe's hosted checkout page, so
// no separate "review your quote" page is needed for a requester who may
// never have created a Wallplace account (curation enquiries are anonymous-
// friendly by design, see ../../route.ts). POST returns the session url as
// JSON instead, for a programmatic caller; both share the same core so their
// validation and session shape cannot drift apart.
//
// The row's id is the only credential this route checks. That mirrors how
// every other id-addressed resource in this codebase is linked to (placement
// pages, order pages): an unguessable UUID is trusted the way a Stripe-hosted
// invoice link is, which fits a flow that starts before the requester
// necessarily has an account to authenticate with.

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Mirrors SETUP_IDEMPOTENCY_WINDOW_MS in placements/[id]/payment/setup/route.ts. */
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 3_600_000;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

interface CurationRow {
  id: string;
  tier: string;
  venue_name: string;
  contact_email: string | null;
  quoted_amount_gbp: number | null;
  billing_interval: "month" | "quarter" | null;
  status: string;
}

type CheckoutResult = { ok: true; url: string } | { ok: false; status: number; error: string };

async function buildCheckoutSession(id: string): Promise<CheckoutResult> {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db
    .from("curation_requests")
    .select("id, tier, venue_name, contact_email, quoted_amount_gbp, billing_interval, status")
    .eq("id", id)
    .maybeSingle<CurationRow>();

  if (error) {
    console.error("curation checkout fetch error:", error);
    return { ok: false, status: 500, error: "Failed to load request" };
  }
  if (!row) {
    return { ok: false, status: 404, error: "Curation request not found" };
  }
  // The single validation this route owns (Task 4 brief): checkout on a row
  // with no quote is 409. A one-off tier row can never reach here with a
  // quote, since only the admin quote route ever writes quoted_amount_gbp and
  // it refuses anything but a programme row, so this one check also covers
  // "wrong tier" without a second lookup.
  if (row.quoted_amount_gbp == null || !row.billing_interval) {
    return { ok: false, status: 409, error: "This request has not been quoted yet." };
  }
  // Post-launch review fix: quoted_amount_gbp and billing_interval are never
  // cleared once the admin quote route writes them, so the check above alone
  // still passes for a row that has since been paid, refunded or cancelled.
  // status is the only field that says the row is CURRENTLY payable, and
  // pending_payment (../../../admin/curation/quote/route.ts) is the exact
  // value that means "quoted, awaiting the requester's payment, nothing else
  // has happened since." Nothing moves a row back into pending_payment once
  // it leaves, so this closes the re-payment hole the two checks above left
  // open: without it, re-clicking the durable emailed link after the
  // hour-long idempotency bucket rolls over could mint a second live
  // subscription for a programme that is already paid.
  if (row.status !== "pending_payment") {
    return { ok: false, status: 409, error: "This request is no longer awaiting payment." };
  }

  const unitAmount = Math.round(row.quoted_amount_gbp * 100);
  // E7b-style dedup: a repeated hit inside the window (a double click, or an
  // email client re-fetching the link) replays the same Stripe session
  // instead of minting a second one. The amount is in the key so a re-quote
  // between two attempts gets a fresh session rather than an idempotency
  // error from Stripe.
  const hourBucket = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: row.contact_email || undefined,
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: `Wallplace Programme, ${row.venue_name}`,
              },
              unit_amount: unitAmount,
              // Stripe has no native "quarterly" interval; it is expressed as
              // month x 3 (Task 4 brief).
              recurring: {
                interval: "month",
                interval_count: row.billing_interval === "quarter" ? 3 : 1,
              },
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: { curation_request_id: row.id, tier: "programme" },
        },
        metadata: { curation_request_id: row.id, tier: "programme" },
        success_url: `${SITE}/curated/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE}/programmes?cancelled=1`,
      },
      { idempotencyKey: `programme_checkout:${row.id}:${unitAmount}:${hourBucket}` },
    );

    if (!session.url) {
      console.error("curation checkout: Stripe session has no url", { id: row.id, sessionId: session.id });
      return { ok: false, status: 500, error: "Stripe error, please try again or contact support." };
    }

    // Best-effort link, mirrors ../../route.ts's D19 pattern: the session
    // already exists and is payable regardless of whether this write lands,
    // so a failure here is logged, never fatal.
    //
    // This column is overwritten on every new idempotency hour bucket,
    // including a bare re-fetch of the link (a mail scanner, a bored
    // requester), so it can end up naming an abandoned, unpaid session
    // rather than the one that actually paid. Task 5's webhook
    // reconciliation must key off Stripe's own session/subscription
    // metadata (curation_request_id), and must never trust this column as
    // "the session that paid."
    const { error: linkErr } = await db
      .from("curation_requests")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", row.id);
    if (linkErr) {
      console.error("curation checkout session link failed, session still payable", {
        requestId: row.id,
        sessionId: session.id,
        linkErr,
      });
    }

    return { ok: true, url: session.url };
  } catch (err) {
    console.error("curation checkout Stripe error:", err);
    return { ok: false, status: 500, error: "Stripe error, please try again or contact support." };
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // This link is reusable and never expires (see eslint-rules/public-routes.js
  // for the full security record), unlike the newsletter confirmation link's
  // single-use, 7-day-expiring token. checkRateLimit is what stands in for
  // those two missing protections here: it bounds how many sessions one
  // client can mint by bulk-fetching a single known link, mirroring
  // newsletter/confirm/route.ts's own use of it.
  const limited = await checkRateLimit(request, 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const result = await buildCheckoutSession(id);
  if (result.ok) {
    return NextResponse.redirect(result.url, 303);
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(request, 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const result = await buildCheckoutSession(id);
  if (result.ok) {
    return NextResponse.json({ url: result.url });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
