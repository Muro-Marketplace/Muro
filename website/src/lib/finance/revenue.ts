// The single owner of every money aggregate (K6, 07 §6).
//
// "Revenue" had several definitions and nobody owned any of them, so
// `/api/admin/stats` and `/api/admin/financials` reported different numbers
// under the same word:
//
//   stats      excluded refunded, cancelled, failed and void
//   financials excluded only cancelled, so refunded orders counted as revenue
//
// Neither was wrong about its own arithmetic; they were answering different
// questions under one label. The questions are named explicitly here instead,
// and both routes are thin presenters over them, so the two are now
// structurally incapable of disagreeing.
//
// Everything returns PENCE. See order-money.ts for why, and for the
// pounds/pence split across tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRevenueBearing, orderGrossPence, type OrderMoneyRow } from "./order-money";
import { PLAN_PRICES } from "@/lib/pricing";

export interface DateRange {
  /** Inclusive lower bound, ISO. Omit for all time. */
  from?: string;
  /** Exclusive upper bound, ISO. */
  to?: string;
}

/** List prices, pence. Env-driven so the dashboard cannot drift from pricing. */
export function planPricesPence(): Record<string, number> {
  return {
    // Bug 17 history: hardcoded fallbacks here once inflated MRR threefold.
    // The fallbacks now come from the pricing source of truth (Task 1) so a
    // reprice cannot desynchronise the dashboard.
    core: Number(process.env.PRICE_CORE_PENCE ?? PLAN_PRICES.core.monthlyPence),
    premium: Number(process.env.PRICE_PREMIUM_PENCE ?? PLAN_PRICES.premium.monthlyPence),
    pro: Number(process.env.PRICE_PRO_PENCE ?? PLAN_PRICES.pro.monthlyPence),
  };
}

async function fetchOrders(
  db: SupabaseClient,
  range: DateRange,
): Promise<OrderMoneyRow[]> {
  // `total` in pounds is the only amount column on orders. Bug 15: selecting the
  // non-existent `amount_cents` alongside it made PostgREST reject the whole
  // statement, so the dashboard read £0 against 12 real paid orders.
  let q = db.from("orders").select("total, status, created_at");
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lt("created_at", range.to);
  const { data, error } = await q;
  if (error) {
    console.error("[finance] orders query failed:", error.message);
    throw new Error(`orders query failed: ${error.message}`);
  }
  return (data ?? []) as OrderMoneyRow[];
}

/**
 * Gross merchandise value: what buyers paid, before any split, over the range.
 *
 * `count` is the number of revenue-bearing orders, so a caller cannot report a
 * total against a different denominator than the one that produced it.
 */
export async function grossMerchandiseValuePence(
  db: SupabaseClient,
  range: DateRange = {},
): Promise<{ pence: number; count: number }> {
  const rows = await fetchOrders(db, range);
  let pence = 0;
  let count = 0;
  for (const row of rows) {
    if (!isRevenueBearing(row)) continue;
    pence += orderGrossPence(row);
    count += 1;
  }
  return { pence, count };
}

/** Artist earnings by user id, from the transfer ledger: money actually paid. */
export async function artistEarningsPence(
  db: SupabaseClient,
): Promise<Map<string, number>> {
  // WS2.5 (audit R3.12): the docstring said "money actually paid" but the
  // query summed EVERY row, so blocked, cancelled and reversed legs inflated
  // the admin's top-artists numbers. Paid and pending are earnings; the
  // dead and clawed-back states are not.
  const { data, error } = await db
    .from("stripe_transfers")
    .select("recipient_user_id, amount_cents")
    .eq("recipient_type", "artist")
    .in("status", ["paid", "pending"]);
  if (error) {
    console.error("[finance] stripe_transfers query failed:", error.message);
    throw new Error(`stripe_transfers query failed: ${error.message}`);
  }
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    recipient_user_id: string | null;
    amount_cents: number | null;
  }>) {
    if (!row.recipient_user_id) continue;
    totals.set(
      row.recipient_user_id,
      (totals.get(row.recipient_user_id) ?? 0) + Number(row.amount_cents ?? 0),
    );
  }
  return totals;
}

/** Venue spend by user id, from the recurring-billing ledger. Already pence. */
export async function venueSpendPence(
  db: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("placement_recurring_billings")
    .select("payer_user_id, monthly_amount_pence")
    .eq("status", "active");
  if (error) {
    console.error("[finance] placement_recurring_billings query failed:", error.message);
    throw new Error(`placement_recurring_billings query failed: ${error.message}`);
  }
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    payer_user_id: string | null;
    monthly_amount_pence: number | null;
  }>) {
    if (!row.payer_user_id) continue;
    totals.set(
      row.payer_user_id,
      (totals.get(row.payer_user_id) ?? 0) + Number(row.monthly_amount_pence ?? 0),
    );
  }
  return totals;
}

/** Subscription MRR in pence, from a plan → active-count map. */
export function subscriptionMrrPence(countsByPlan: Record<string, number>): number {
  const prices = planPricesPence();
  return Object.entries(countsByPlan).reduce(
    (sum, [plan, count]) => sum + (prices[plan] ?? 0) * count,
    0,
  );
}

/**
 * Statuses a curation_requests row passes through while it is a live,
 * paying Wallplace Programme subscription. `in_progress` is set by
 * handleCurationInvoicePaid (src/lib/curation/billing.ts) on every paid
 * invoice, and is the state a healthy programme spends almost all its life
 * in. `paid` is included alongside it because the general admin PATCH
 * (src/app/api/admin/curation/route.ts) can set it on any row regardless of
 * tier, and a manually-marked-paid programme is not different in kind from
 * an in_progress one — the client has paid.
 *
 * Deliberately EXCLUDED, both a considered call rather than an oversight:
 *
 *   - past_due: invoice.payment_failed while Stripe still has retry attempts
 *     left (billing.ts's handleCurationInvoiceFailed). Nothing has actually
 *     been collected for the current cycle yet, so counting it would report
 *     revenue that has not landed — the same "same word, different number"
 *     failure this file's header describes for gross revenue, just for MRR
 *     instead. It also matches the existing precedent one query away: the
 *     admin financials route's artist-MRR count reads
 *     `subscription_status IN ('active', 'trialing')` and likewise leaves
 *     out an artist subscription's own past_due state. Keeping the same
 *     exclusion rule here means "MRR" means one thing everywhere on that
 *     page, not two.
 *   - paused: invoice.payment_failed once Stripe has exhausted every retry
 *     (next_payment_attempt === null). Nothing is even being attempted any
 *     more — there is no live revenue here without a human re-engaging the
 *     client, which makes it economically indistinguishable from churn
 *     until someone acts on it, even though the row itself is not
 *     `cancelled`.
 *   - awaiting_quote / pending_payment: never paid in the first place.
 *   - cancelled / refunded / shortlist_sent / completed: not a recurring
 *     paying arrangement any more, or (the latter two) statuses that belong
 *     to the one-off tiers' lifecycle, not a subscription's.
 */
const LIVE_PAYING_PROGRAMME_STATUSES = ["in_progress", "paid"] as const;

interface ProgrammeSubscriptionRow {
  quoted_amount_gbp: number | null;
  billing_interval: "month" | "quarter" | null;
}

/**
 * Programme MRR in pence: the monthly-equivalent sum of every live, paying
 * Wallplace Programme subscription. Sibling to subscriptionMrrPence, kept
 * separate rather than folded into one blended number, because the mix
 * between the two is exactly what the business needs to watch (see the
 * admin financials page, which surfaces both plus their total rather than
 * one figure that hides which is actually growing).
 *
 * `quoted_amount_gbp` is the amount Stripe actually charges PER INVOICE —
 * unit_amount in curation/[id]/checkout/route.ts — not pre-divided to a
 * monthly figure, so a quarterly-billed row is divided by 3 here, mirroring
 * monthlyEquivalentGbp() in admin/curation/quote/route.ts.
 */
export async function programmeMrrPence(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from("curation_requests")
    .select("quoted_amount_gbp, billing_interval")
    .eq("tier", "programme")
    .in("status", LIVE_PAYING_PROGRAMME_STATUSES);
  if (error) {
    console.error("[finance] curation_requests programme query failed:", error.message);
    throw new Error(`curation_requests programme query failed: ${error.message}`);
  }
  let pence = 0;
  for (const row of (data ?? []) as ProgrammeSubscriptionRow[]) {
    const invoicedPence = Math.round((row.quoted_amount_gbp ?? 0) * 100);
    pence += row.billing_interval === "quarter" ? Math.round(invoicedPence / 3) : invoicedPence;
  }
  return pence;
}
