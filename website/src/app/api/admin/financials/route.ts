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
import { recordAdminAction } from "@/lib/admin-audit";
import {
  artistEarningsPence,
  grossMerchandiseValuePence,
  subscriptionMrrPence,
  venueSpendPence,
} from "@/lib/finance/revenue";

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

  // Audit each financials read. The dashboard exposes MRR + top
  // venues/artists by spend, so reads are sensitive even though the
  // page is read-only.
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "financials.read",
  });

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

  // K6: the price map and the multiply lived here. Moved to lib/finance so
  // there is one definition of MRR.
  const mrrPence = subscriptionMrrPence(subsByPlan);

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

  // K6: this had its own sumOrders that excluded ONLY `cancelled`, so a refunded
  // order counted as revenue here while /api/admin/stats excluded it. Same word,
  // different number. Both go through grossMerchandiseValuePence now, which owns
  // the status filter and the pounds→pence conversion.
  const revenueThisMonthPence = (
    await grossMerchandiseValuePence(db, { from: thisMonthStart.toISOString() })
  ).pence;
  const revenueYearAgoPence = (
    await grossMerchandiseValuePence(db, {
      from: yearAgoMonthStart.toISOString(),
      to: new Date(
        Date.UTC(yearAgoMonthStart.getUTCFullYear(), yearAgoMonthStart.getUTCMonth() + 1, 1),
      ).toISOString(),
    })
  ).pence;

  // Top 10 venues by spend, and top 10 artists by earnings. Both aggregations
  // moved to lib/finance with the rest (K6).
  const topVenues = [...(await venueSpendPence(db)).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topArtists = [...(await artistEarningsPence(db)).entries()]
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
