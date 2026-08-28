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
  const { data, error } = await db
    .from("stripe_transfers")
    .select("recipient_user_id, amount_cents")
    .eq("recipient_type", "artist");
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
