import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAllArtists } from "@/lib/db/merged-data";
import { grossMerchandiseValuePence } from "@/lib/finance/revenue";

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
        // K6: the two order queries and the summing that followed them used to
        // live here, with their own status filter and their own pounds→pence
        // conversion, while /api/admin/financials had a different copy of both.
        // lib/finance owns the question now; this route just asks it. Same query
        // count as before.
        //
        // Bug 15 is why the module selects `total` and not `amount_cents`: that
        // column exists in no migration and not in the live table, so selecting
        // it made PostgREST reject the whole statement and the dashboard read £0
        // against 12 real paid orders.
        grossMerchandiseValuePence(db),
        grossMerchandiseValuePence(db, { from: thirtyDaysAgo }),
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

    const allTime = ordersAll;
    const last30 = orders30d;

    // Bug 24: the public marketplace count (approved DB artists + static seed)
    // so the admin "Registered Artists (DB)" number reconciles with the public
    // figure instead of looking wrong. Resilient: falls back to 0 on error.
    const artistsListed = await getAllArtists().then((a) => a.length).catch(() => 0);

    return NextResponse.json({
      applications: { total: applications.length, pending, accepted, rejected },
      artists: artists.data?.length || 0,
      artistsListed,
      venues: venues.data?.length || 0,
      placements: placementsCounts,
      qrScans: {
        total: qrTotal.count ?? 0,
        last7d: qr7d.count ?? 0,
        last30d: qr30d.count ?? 0,
      },
      payouts: {
        // Cents, the UI formats these to £ before rendering.
        grossCents: allTime.pence,
        count: allTime.count,
        last30dCents: last30.pence,
        last30dCount: last30.count,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
