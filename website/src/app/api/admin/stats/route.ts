import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/admin/stats
 *
 * Returns the rolled-up counters the admin dashboard tiles render.
 * Each section degrades independently, a missing analytics_events
 * or orders table doesn't take the whole response down.
 */
export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const db = getSupabaseAdmin();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [apps, artists, venues, placements, qrTotal, qr7d, qr30d, ordersAll, orders30d] =
      await Promise.all([
        db.from("artist_applications").select("status"),
        db.from("artist_profiles").select("id"),
        db.from("venue_profiles").select("id"),
        // Placements, pull `status` for the breakdown.
        db.from("placements").select("status"),
        // QR scan totals, count rows; head:true means no row data, just count.
        db
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "qr_scan"),
        db
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "qr_scan")
          .gte("created_at", sevenDaysAgo),
        db
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "qr_scan")
          .gte("created_at", thirtyDaysAgo),
        // Orders, pull amount + status for the gross-revenue computation.
        // We restrict to paid statuses so refunded/abandoned orders don't
        // inflate the headline number on the dashboard.
        db.from("orders").select("amount_cents, status, created_at"),
        db
          .from("orders")
          .select("amount_cents, status, created_at")
          .gte("created_at", thirtyDaysAgo),
      ]);

    const applications = apps.data || [];
    const pending = applications.filter((a) => a.status === "pending").length;
    const accepted = applications.filter((a) => a.status === "accepted").length;
    const rejected = applications.filter((a) => a.status === "rejected").length;

    // Placement status breakdown, handle both legacy ("Active") and
    // newer lower-case values defensively.
    const placementsRows = (placements.data || []) as Array<{ status?: string }>;
    function countPlacement(...statuses: string[]): number {
      const set = new Set(statuses.map((s) => s.toLowerCase()));
      return placementsRows.filter((p) =>
        set.has((p.status || "").toLowerCase()),
      ).length;
    }
    const placementsCounts = {
      total: placementsRows.length,
      pending: countPlacement("pending"),
      active: countPlacement("active", "scheduled", "installed"),
      completed: countPlacement("completed", "ended"),
      cancelled: countPlacement("cancelled", "declined"),
    };

    // Orders → gross-paid sum + count, plus a last-30d slice. We treat
    // any row with a non-failed status as "paid" since the lifecycle
    // varies (paid / shipped / delivered / etc.). Refunded / cancelled
    // are explicitly excluded.
    const PAID_EXCLUDE = new Set(["refunded", "cancelled", "failed", "void"]);
    function sumPaid(rows: Array<{ amount_cents?: number | null; status?: string | null }>): {
      gross: number;
      count: number;
    } {
      let gross = 0;
      let count = 0;
      for (const row of rows) {
        if (PAID_EXCLUDE.has(((row.status as string) || "").toLowerCase())) continue;
        gross += Number(row.amount_cents || 0);
        count += 1;
      }
      return { gross, count };
    }
    const ordersAllRows = (ordersAll.data || []) as Array<{
      amount_cents?: number | null;
      status?: string | null;
    }>;
    const orders30dRows = (orders30d.data || []) as Array<{
      amount_cents?: number | null;
      status?: string | null;
    }>;
    const allTime = sumPaid(ordersAllRows);
    const last30 = sumPaid(orders30dRows);

    return NextResponse.json({
      applications: { total: applications.length, pending, accepted, rejected },
      artists: artists.data?.length || 0,
      venues: venues.data?.length || 0,
      placements: placementsCounts,
      qrScans: {
        total: qrTotal.count ?? 0,
        last7d: qr7d.count ?? 0,
        last30d: qr30d.count ?? 0,
      },
      payouts: {
        // Cents, the UI formats these to £ before rendering.
        grossCents: allTime.gross,
        count: allTime.count,
        last30dCents: last30.gross,
        last30dCount: last30.count,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
