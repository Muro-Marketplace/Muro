// Wallplace Programmes, Task 4. The admin half of quoted checkout: writes a
// price onto an `awaiting_quote` programme row, which is the only thing that
// makes it payable (the requester's checkout route, ../../../curation/[id]
// /checkout/route.ts, 409s on a row with no quote).
//
// Lives in its own route rather than folding into ../route.ts's generic
// status/notes PATCH, mirroring ../refund/route.ts: a quote carries several
// interdependent mis-quote guards (below) and its own audit action name,
// which the generic PATCH schema was never built to hold, and every field it
// touches is programme-specific rather than a general request-lifecycle field.
//
// Every programme is quoted individually (curation-tiers.ts: no fixed Stripe
// price), so there is nothing here resembling the old managed-tier
// integrity check (Stripe price must equal tier price x 100) — that check
// does not apply to a quoted_subscription tier and must not be reintroduced
// for one.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { CurationQuoteReady } from "@/emails/templates/venue-lifecycle/CurationQuoteReady";
import {
  CURATION_TIERS,
  PROGRAMME_PIECE_RENT_MIN_GBP,
  PROGRAMME_RENT_SHARE_MAX,
  PROGRAMME_FOUNDING_SITE_LIMIT,
} from "@/lib/curation-tiers";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

const quoteSchema = z.object({
  id: z.string().uuid(),
  quotedAmountGbp: z.number().positive(),
  billingInterval: z.enum(["month", "quarter"]),
  piecesEstimate: z.number().int().positive().max(60),
  pieceRentGbp: z.number().positive(),
  rotationCadence: z.enum(["quarterly", "biannual", "none"]),
  // Owner decision: the first PROGRAMME_FOUNDING_SITE_LIMIT programme clients
  // lock their quoted rate for 24 months. Defaults false so an admin quoting
  // routinely never has to think about the cohort.
  foundingSite: z.boolean().optional().default(false),
});

interface CurationRow {
  id: string;
  tier: string;
  status: string;
  venue_name: string;
  contact_name: string | null;
  contact_email: string | null;
}

/**
 * A quote's value per month, however it is billed. A quarterly amount covers
 * three months, so its monthly equivalent is a third of it. Both mis-quote
 * guards below (the tier floor and the rent-pool share) are evaluated against
 * this, not the raw quoted figure: a £100 QUARTERLY quote clears a naive
 * ">= £79.99" check while actually being £33.33 a month, well under the
 * tier's real floor. The guard exists to catch exactly that.
 */
function monthlyEquivalentGbp(quotedAmountGbp: number, billingInterval: "month" | "quarter"): number {
  return billingInterval === "quarter" ? quotedAmountGbp / 3 : quotedAmountGbp;
}

export async function POST(request: Request) {
  return withAdmin(request, "programme_quoted", async ({ audit }) => {
    const body = await request.json().catch(() => null);
    const parsed = quoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const d = parsed.data;

    // Mis-quote guards. Pure functions of the payload, so these run before any
    // DB round trip: a bad quote is rejected the same way regardless of which
    // row it names.
    const monthlyEquivalent = monthlyEquivalentGbp(d.quotedAmountGbp, d.billingInterval);
    if (monthlyEquivalent < CURATION_TIERS.programme.priceGbp) {
      return NextResponse.json(
        {
          error:
            `A programme quote must be worth at least £${CURATION_TIERS.programme.priceGbp} a month ` +
            `(this one works out to £${monthlyEquivalent.toFixed(2)} a month).`,
        },
        { status: 400 },
      );
    }
    if (d.pieceRentGbp < PROGRAMME_PIECE_RENT_MIN_GBP) {
      return NextResponse.json(
        { error: `Artist rent must be at least £${PROGRAMME_PIECE_RENT_MIN_GBP} per piece per month.` },
        { status: 400 },
      );
    }
    const rentPool = d.piecesEstimate * d.pieceRentGbp;
    const rentPoolCeiling = monthlyEquivalent * PROGRAMME_RENT_SHARE_MAX;
    if (rentPool > rentPoolCeiling) {
      return NextResponse.json(
        {
          error:
            `The rent pool (£${rentPool.toFixed(2)} a month) would exceed ${PROGRAMME_RENT_SHARE_MAX * 100}% ` +
            `of the quote (£${rentPoolCeiling.toFixed(2)} a month). Raise the quote or lower the rent.`,
        },
        { status: 400 },
      );
    }

    const db = getSupabaseAdmin();
    const { data: row, error: fetchError } = await db
      .from("curation_requests")
      .select("id, tier, status, venue_name, contact_name, contact_email")
      .eq("id", d.id)
      .maybeSingle<CurationRow>();

    if (fetchError) {
      console.error("admin curation quote fetch error:", fetchError);
      return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Curation request not found" }, { status: 404 });
    }
    if (row.tier !== "programme" || row.status !== "awaiting_quote") {
      return NextResponse.json(
        { error: "Only an awaiting-quote programme request can be quoted." },
        { status: 409 },
      );
    }

    if (d.foundingSite) {
      const { count: foundingCount, error: countError } = await db
        .from("curation_requests")
        .select("id", { count: "exact", head: true })
        .eq("founding_site", true);
      if (countError) {
        console.error("admin curation quote founding count error:", countError);
        return NextResponse.json({ error: "Failed to check the founding cohort" }, { status: 500 });
      }
      if ((foundingCount ?? 0) >= PROGRAMME_FOUNDING_SITE_LIMIT) {
        return NextResponse.json(
          { error: `The founding cohort is full (${PROGRAMME_FOUNDING_SITE_LIMIT} sites).` },
          { status: 409 },
        );
      }
    }

    const { error: updateError } = await db
      .from("curation_requests")
      .update({
        quoted_amount_gbp: d.quotedAmountGbp,
        billing_interval: d.billingInterval,
        pieces_estimate: d.piecesEstimate,
        piece_rent_gbp: d.pieceRentGbp,
        rotation_cadence: d.rotationCadence,
        // Not admin-supplied (the interface deliberately carries no
        // termMonths field): every programme quote runs on the tier's
        // standard term until there is a reason to let an admin vary it.
        term_months: CURATION_TIERS.programme.termMonths,
        founding_site: d.foundingSite,
        // No dedicated "quoted" status exists (see the CHECK in migration
        // 100): pending_payment is the accurate description of a row that has
        // a price and is waiting on the requester to pay it, and it doubles
        // as the guard that stops this same row from being quoted twice,
        // since the row-state check above requires awaiting_quote.
        status: "pending_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", d.id);

    if (updateError) {
      console.error("admin curation quote update error:", updateError);
      return NextResponse.json({ error: "Failed to save the quote" }, { status: 500 });
    }

    // context is JSONB and would otherwise accumulate the requester's contact
    // details (../route.ts's PATCH follows the same discipline).
    audit({
      curationRequestId: d.id,
      quotedAmountGbp: d.quotedAmountGbp,
      billingInterval: d.billingInterval,
      piecesEstimate: d.piecesEstimate,
      pieceRentGbp: d.pieceRentGbp,
      rotationCadence: d.rotationCadence,
      foundingSite: d.foundingSite,
    });

    if (row.contact_email) {
      try {
        await sendEmail({
          idempotencyKey: `curation_quote_ready:${d.id}`,
          template: "curation_quote_ready",
          category: "orders_and_payouts",
          to: row.contact_email,
          subject: "Your Wallplace programme quote is ready",
          react: CurationQuoteReady({
            contactFirstName: (row.contact_name || "there").split(" ")[0],
            venueName: row.venue_name,
            quotedAmount: { amount: Math.round(d.quotedAmountGbp * 100), currency: "GBP" },
            billingInterval: d.billingInterval,
            checkoutUrl: `${SITE}/api/curation/${d.id}/checkout`,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { curationRequestId: d.id },
        });
      } catch (emailErr) {
        // The quote stands even if the email fails to send; log it so support
        // can resend rather than silently leaving the requester with nothing.
        console.error("admin curation quote email error:", emailErr);
      }
    }

    return NextResponse.json({ success: true, status: "pending_payment" });
  });
}
