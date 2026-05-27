// Phase 2.8 A3. Read-only financials dashboard. Aggregates:
//   - active subscriptions count by plan + MRR
//   - failed payments this month + last month
//   - renewals coming up in the next 7 days
//   - total revenue this month + YoY
//   - top 10 venues by spend
//   - top 10 artists by earnings
//
// We don't precompute or cache; query volume is low (admin-only) and
// staleness matters more than throughput here.

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfMonthYearAgo(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), 1));
}

export async function GET(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const yearAgoMonthStart = startOfMonthYearAgo(now);
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Subscriptions: count by plan, only active / trialing.
  const { data: artistSubs } = await db
    .from("artist_profiles")
    .select("subscription_plan, subscription_status")
    .in("subscription_status", ["active", "trialing"]);
  const subsByPlan: Record<string, number> = { core: 0, premium: 0, pro: 0 };
  for (const r of (artistSubs ?? []) as Array<{ subscription_plan: string | null }>) {
    const p = (r.subscription_plan ?? "core").toLowerCase();
    if (p in subsByPlan) subsByPlan[p]++;
  }

  // MRR. Pull list prices from env so the dashboard doesn't ship a
  // hard-coded number that drifts when pricing changes.
  const PRICES_PENCE: Record<string, number> = {
    core: Number(process.env.PRICE_CORE_PENCE ?? 2_900),
    premium: Number(process.env.PRICE_PREMIUM_PENCE ?? 9_900),
    pro: Number(process.env.PRICE_PRO_PENCE ?? 19_900),
  };
  const mrrPence = Object.entries(subsByPlan).reduce(
    (sum, [plan, count]) => sum + (PRICES_PENCE[plan] ?? 0) * count,
    0,
  );

  // Failed payments this month + last month (artist_profiles flips
  // to subscription_status='past_due' on a failed invoice).
  const { count: failedThisMonth } = await db
    .from("artist_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("subscription_status", "past_due")
    .gte("updated_at", thisMonthStart.toISOString());
  const { count: failedLastMonth } = await db
    .from("artist_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("subscription_status", "past_due")
    .gte("updated_at", lastMonthStart.toISOString())
    .lt("updated_at", thisMonthStart.toISOString());

  // Upcoming renewals: pull from the placement_recurring_billings
  // table (Phase 1g/2.2) where current_period_end is in the next 7 days.
  const { data: renewals } = await db
    .from("placement_recurring_billings")
    .select("placement_id, monthly_amount_pence, current_period_end")
    .eq("status", "active")
    .gte("current_period_end", now.toISOString())
    .lte("current_period_end", sevenDaysOut.toISOString())
    .order("current_period_end", { ascending: true });

  // Revenue. Sum orders.total + revenue from paid-loan invoices within
  // the period. orders.total is in pounds; convert to pence for one
  // consistent unit at the API boundary.
  const sumOrders = async (gte: string, lt?: string): Promise<number> => {
    let q = db
      .from("orders")
      .select("total")
      .gte("created_at", gte)
      .neq("status", "cancelled");
    if (lt) q = q.lt("created_at", lt);
    const { data } = await q;
    return (data ?? []).reduce(
      (s, r) => s + Math.round(((r as { total: number | null }).total ?? 0) * 100),
      0,
    );
  };
  const revenueThisMonthPence = await sumOrders(thisMonthStart.toISOString());
  const revenueYearAgoPence = await sumOrders(
    yearAgoMonthStart.toISOString(),
    new Date(Date.UTC(yearAgoMonthStart.getUTCFullYear(), yearAgoMonthStart.getUTCMonth() + 1, 1)).toISOString(),
  );

  // Top 10 venues by spend.
  const { data: venueSpend } = await db
    .from("placement_recurring_billings")
    .select("payer_user_id, monthly_amount_pence")
    .eq("status", "active");
  const venueTotals = new Map<string, number>();
  for (const r of (venueSpend ?? []) as Array<{
    payer_user_id: string;
    monthly_amount_pence: number;
  }>) {
    venueTotals.set(
      r.payer_user_id,
      (venueTotals.get(r.payer_user_id) ?? 0) + r.monthly_amount_pence,
    );
  }
  const topVenues = [...venueTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Top 10 artists by earnings (stripe_transfers ledger).
  const { data: artistEarnings } = await db
    .from("stripe_transfers")
    .select("recipient_user_id, amount_cents")
    .eq("recipient_type", "artist");
  const artistTotals = new Map<string, number>();
  for (const r of (artistEarnings ?? []) as Array<{
    recipient_user_id: string;
    amount_cents: number;
  }>) {
    artistTotals.set(
      r.recipient_user_id,
      (artistTotals.get(r.recipient_user_id) ?? 0) + r.amount_cents,
    );
  }
  const topArtists = [...artistTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return NextResponse.json({
    subscriptions: {
      total:
        subsByPlan.core + subsByPlan.premium + subsByPlan.pro,
      byPlan: subsByPlan,
      mrrPence,
    },
    failedPayments: {
      thisMonth: failedThisMonth ?? 0,
      lastMonth: failedLastMonth ?? 0,
    },
    upcomingRenewals: (renewals ?? []).map((r) => r as {
      placement_id: string;
      monthly_amount_pence: number;
      current_period_end: string;
    }),
    revenue: {
      thisMonthPence: revenueThisMonthPence,
      yearAgoPence: revenueYearAgoPence,
    },
    topVenues: topVenues.map(([userId, totalPence]) => ({ userId, totalPence })),
    topArtists: topArtists.map(([userId, totalPence]) => ({ userId, totalPence })),
  });
}
