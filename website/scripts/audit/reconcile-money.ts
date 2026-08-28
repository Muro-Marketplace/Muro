#!/usr/bin/env tsx
/**
 * 04 §9.3. Do the books agree with themselves?
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run audit:reconcile
 *   npm run audit:reconcile -- --since 2026-01-01 --until 2026-09-01
 *   npm run audit:reconcile -- --json          # for a cron to alert on
 *
 * For every revenue-bearing order in the range it checks two things:
 *
 *   1. `total` equals `artist_revenue + venue_revenue + platform_fee`. A gap
 *      means money was collected and not allocated to anyone (E9's pooled
 *      remainder, D16's wrong denominator).
 *   2. every penny of `artist_revenue` has a matching `stripe_transfers` row.
 *      A gap means the artist is owed money nothing is scheduled to send —
 *      which is exactly D4's silent zero-payout, and the failure mode with no
 *      other alarm on it.
 *
 * WHAT IT CANNOT SEE. It never talks to Stripe, so it cannot confirm that a
 * transfer marked `paid` actually settled. It answers "are our own books
 * internally consistent", not "does Stripe agree". Reconciling against the
 * Stripe balance is a different job and needs a live key.
 *
 * Exit codes: 0 clean, 1 drift found, 2 misconfigured. So it can be a cron that
 * pages on a non-zero exit.
 */

import { createClient } from "@supabase/supabase-js";
import { reconcile, formatReport, type ReconcilableOrder, type TransferRow } from "../../src/lib/finance/reconcile";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Paged read, because a range can be larger than PostgREST's default page. */
async function readAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error } = await fetchPage(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`${label} read failed: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  throw new Error(`${label}: more than 200 pages, refusing to keep reading`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Both are required: orders and stripe_transfers are service-role only.",
    );
    process.exit(2);
  }

  const since = arg("since") ?? "1970-01-01";
  const until = arg("until") ?? new Date().toISOString();
  const asJson = process.argv.includes("--json");

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const orders = await readAll<ReconcilableOrder>(
    async (from, to) =>
      db
        .from("orders")
        .select("id, created_at, status, total, artist_revenue, venue_revenue, platform_fee, artist_user_id")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: true })
        .range(from, to),
    "orders",
  );

  // Every transfer for those orders, whenever it was created: a transfer can be
  // scheduled days after the order, and filtering transfers by the same date
  // range would report a false "no transfer" on every order near the boundary.
  const orderIds = orders.map((o) => o.id);
  const transfers: TransferRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("stripe_transfers")
      .select("order_id, amount_cents, status")
      .in("order_id", slice);
    if (error) throw new Error(`stripe_transfers read failed: ${error.message}`);
    transfers.push(...((data ?? []) as TransferRow[]));
  }

  const report = reconcile(orders, transfers);

  if (asJson) {
    console.log(JSON.stringify({ since, until, ...report }, null, 2));
  } else {
    console.log(`Reconciling ${since} to ${until}\n`);
    console.log(formatReport(report));
  }

  process.exit(report.drifts.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
