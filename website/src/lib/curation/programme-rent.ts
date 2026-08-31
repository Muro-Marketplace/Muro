// Task 6: rent accrual on paid Wallplace Programme invoices.
//
// The distinctive thing about a Programme is that every artist whose work
// hangs under it is paid rent out of the client's fee (curation-tiers.ts:
// PROGRAMME_PIECE_RENT_TARGET_GBP, about £10/piece/month). Task 5 reconciles
// a programme's paid invoices against curation_requests.status; nothing
// before this recorded WHO is owed WHAT. accrueProgrammeRent is that record:
// called from billing.ts's handleCurationInvoicePaid on every paid invoice,
// it writes one immutable row per linked, active, rented placement into
// programme_rent_accruals (migration 122). Task 7 settles these quarterly;
// nothing here moves money or touches Stripe.
//
// Idempotency is the DB's job, not this function's: migration 122's
// UNIQUE (stripe_invoice_id, placement_id) is what actually stops a Stripe
// webhook redelivery from double-accruing. This function's contribution is
// recognising that specific failure (Postgres 23505) as an expected replay
// rather than an error, and counting it as `skipped` instead of throwing.
// Any other insert failure is a real problem and is thrown, to be caught by
// the caller's own try/catch (billing.ts wraps this call so an accrual
// failure never breaks the invoice reconciliation it runs after).
//
// The pool guard (PROGRAMME_RENT_SHARE_MAX, currently 70%) runs once, before
// any insert is attempted, against the REAL linked placements — not
// curation_requests.pieces_estimate. See the task report for the full
// reasoning; in short, pieces_estimate is what the admin quoted against at
// intake ("guidance for the admin quote, not a locked total", migration
// 121), while the placements actually linked afterward are the real
// obligation this guard exists to bound. This function is never even handed
// pieces_estimate — its only inputs are the invoice being paid and the
// programme's quoted amount — which is itself the evidence for that choice:
// there is nothing else here it COULD compare against.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { PROGRAMME_RENT_SHARE_MAX } from "@/lib/curation-tiers";

export interface AccrueProgrammeRentInput {
  curationRequestId: string;
  /** Stripe invoice id. Half of the idempotency key with placement_id. */
  invoiceId: string;
  /** 1 for a monthly invoice, 3 for a quarterly one. */
  periodMonths: number;
  /**
   * The programme's quoted amount, in pence, AS CHARGED ON THIS INVOICE —
   * i.e. curation_requests.quoted_amount_gbp * 100, the same figure Stripe
   * charges every invoice regardless of cadence (curation/[id]/checkout
   * /route.ts sets this as unit_amount with interval_count 1 or 3). It is
   * NOT pre-divided to a monthly figure; this function does that division
   * itself using periodMonths, the same way admin/curation/quote/route.ts's
   * monthlyEquivalentGbp() does for the tier-floor guard at quote time.
   */
  quotedAmountPence: number;
}

export interface AccrueProgrammeRentResult {
  /** Accrual rows newly inserted by this call. */
  accrued: number;
  /**
   * Placements whose insert hit the UNIQUE (stripe_invoice_id, placement_id)
   * constraint — i.e. this exact invoice already accrued for that placement.
   * Zero whenever blockedReason is set: the pool guard refuses the whole
   * invoice before any insert is attempted, so nothing is individually
   * skipped, everything is.
   */
  skipped: number;
  /** Set only when the rent-pool guard refused to accrue anything at all. */
  blockedReason?: string;
}

interface EligiblePlacementRow {
  id: string;
  artist_user_id: string;
  programme_rent_gbp: number;
}

/**
 * Postgres unique_violation. Matches the check paid-loan-billing.ts already
 * uses for the analogous stripe_transfers idempotency guard.
 */
const UNIQUE_VIOLATION = "23505";

export async function accrueProgrammeRent(
  db: SupabaseClient,
  input: AccrueProgrammeRentInput,
): Promise<AccrueProgrammeRentResult> {
  const { curationRequestId, invoiceId, periodMonths, quotedAmountPence } = input;

  // Active, linked, actually rented, and still has an artist to pay — an
  // erased artist's placements survive erasure (migration 117: SET NULL, not
  // CASCADE) but with artist_user_id cleared, and there is nobody left here
  // to accrue rent for.
  const { data, error } = await db
    .from("placements")
    .select("id, artist_user_id, programme_rent_gbp")
    .eq("programme_request_id", curationRequestId)
    .eq("status", "active")
    .gt("programme_rent_gbp", 0)
    .not("artist_user_id", "is", null);

  if (error) {
    throw new Error(`[programme-rent] failed to load linked placements: ${error.message}`);
  }

  const placements = (data ?? []) as EligiblePlacementRow[];
  if (placements.length === 0) {
    return { accrued: 0, skipped: 0 };
  }

  // Both sides of the guard are MONTHLY rates. periodMonths scales the
  // amount actually accrued below, never this comparison — otherwise a
  // quarterly invoice's larger quotedAmountPence would look proportionally
  // more generous than the arrangement actually is, and a pool that is
  // genuinely unsustainable month to month would sail through on a
  // quarterly-billed programme when it would have been blocked on an
  // otherwise-identical monthly one.
  const monthlyRentPoolPence = placements.reduce(
    (sum, p) => sum + Math.round(p.programme_rent_gbp * 100),
    0,
  );
  const monthlyEquivalentQuotePence = quotedAmountPence / periodMonths;
  const poolCeilingPence = monthlyEquivalentQuotePence * PROGRAMME_RENT_SHARE_MAX;

  if (monthlyRentPoolPence > poolCeilingPence) {
    const blockedReason =
      `Rent pool (£${(monthlyRentPoolPence / 100).toFixed(2)}/month) would exceed ` +
      `${PROGRAMME_RENT_SHARE_MAX * 100}% of the quote's monthly equivalent ` +
      `(£${(monthlyEquivalentQuotePence / 100).toFixed(2)}/month) across ${placements.length} ` +
      `linked placement${placements.length === 1 ? "" : "s"}.`;

    // Independent try/catch, matching billing.ts's own pattern for the
    // programme first-payment alert: an alert-delivery failure must not
    // turn into a thrown exception from a function whose job here is to
    // report "blocked", not to guarantee the report was read.
    try {
      await sendAdminAlert({
        idempotencyKey: `programme_rent_pool_blocked:${invoiceId}`,
        subject: `Programme rent pool blocked: over ${PROGRAMME_RENT_SHARE_MAX * 100}% of quote`,
        summary: `Rent accrual for curation request ${curationRequestId} was blocked. ${blockedReason}`,
        fields: [
          { label: "Request", value: curationRequestId },
          { label: "Invoice", value: invoiceId },
          { label: "Linked placements", value: String(placements.length) },
          { label: "Monthly rent pool", value: `£${(monthlyRentPoolPence / 100).toFixed(2)}` },
          {
            label: "Monthly-equivalent quote",
            value: `£${(monthlyEquivalentQuotePence / 100).toFixed(2)}`,
          },
        ],
        actionPath: "/admin/curation",
        actionLabel: "View in admin",
      });
    } catch (err) {
      console.error("[programme-rent] pool-blocked admin alert failed", {
        curationRequestId,
        invoiceId,
        err,
      });
    }

    return { accrued: 0, skipped: 0, blockedReason };
  }

  let accrued = 0;
  let skipped = 0;
  for (const p of placements) {
    const amountPence = Math.round(p.programme_rent_gbp * 100) * periodMonths;
    const { error: insertError } = await db.from("programme_rent_accruals").insert({
      curation_request_id: curationRequestId,
      placement_id: p.id,
      artist_user_id: p.artist_user_id,
      stripe_invoice_id: invoiceId,
      period_months: periodMonths,
      amount_pence: amountPence,
    });

    if (insertError) {
      if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
        // This exact invoice already accrued for this exact placement —
        // a Stripe webhook redelivery, not a problem.
        skipped++;
        continue;
      }
      console.error("[programme-rent] accrual insert failed", {
        curationRequestId,
        placementId: p.id,
        invoiceId,
        insertError,
      });
      throw new Error(`[programme-rent] accrual insert failed: ${insertError.message}`);
    }
    accrued++;
  }

  return { accrued, skipped };
}
