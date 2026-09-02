import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const revalidate = 300; // Cache for 5 minutes

/**
 * GET /api/stats/public
 * Unauthenticated, returns aggregate platform stats for the homepage trust bar.
 */
export async function GET(request: Request) {
  const limited = await checkRateLimit(request, 60, 60000);
  if (limited) return limited;
  try {
    // Launch audit, blocker 3. The anon client has no SELECT on
    // artist_profiles or venue_profiles in production, so this returned
    // zeros. The service-role client reads the same tables; the approved
    // filter below is what keeps the number honest, not RLS.
    const supabase = getSupabaseAdmin();

    // Row A L123. This counted every artist_profiles row, including pending
    // and rejected ones, which is not what a visitor can browse. The public
    // marketplace filters on review_status = 'approved' (and so does the anon
    // RLS policy); the count says the same thing explicitly rather than
    // depending on which client happens to run it.
    const [artistsRes, worksRes, placementsRes, venuesRes] = await Promise.all([
      supabase
        .from("artist_profiles")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "approved"),
      supabase.from("artist_works").select("id", { count: "exact", head: true }),
      supabase.from("placements").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("venue_profiles").select("id", { count: "exact", head: true }),
    ]);

    // Count sold works
    const { count: soldCount } = await supabase
      .from("artist_works")
      .select("id", { count: "exact", head: true })
      .eq("available", false);

    return NextResponse.json({
      total_artists: artistsRes.count || 0,
      total_artworks: worksRes.count || 0,
      total_placements: placementsRes.count || 0,
      total_venues: venuesRes.count || 0,
      artworks_sold: soldCount || 0,
    });
  } catch {
    return NextResponse.json({
      total_artists: 0,
      total_artworks: 0,
      total_placements: 0,
      total_venues: 0,
      artworks_sold: 0,
    });
  }
}
