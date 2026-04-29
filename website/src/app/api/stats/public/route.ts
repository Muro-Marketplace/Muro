import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
    const [artistsRes, worksRes, placementsRes, venuesRes] = await Promise.all([
      supabase.from("artist_profiles").select("id", { count: "exact", head: true }),
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
