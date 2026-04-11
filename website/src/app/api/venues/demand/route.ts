import { NextResponse } from "next/server";
import { venues as staticVenues } from "@/data/venues";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 300; // Cache 5 minutes

/**
 * GET /api/venues/demand
 * Public — returns all venues with preferences for the demand tracker.
 * Merges static venues with database venue profiles.
 */
export async function GET() {
  try {
    const db = getSupabaseAdmin();

    // Fetch DB venue profiles
    const { data: dbVenues } = await db
      .from("venue_profiles")
      .select("slug, name, type, location, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, interested_in_collections, preferred_styles, preferred_themes")
      .order("created_at", { ascending: false });

    // Merge: DB venues override static by slug
    const dbSlugs = new Set((dbVenues || []).map((v) => v.slug));
    const staticOnly = staticVenues.filter((v) => !dbSlugs.has(v.slug));

    const allVenues = [
      ...(dbVenues || []).map((v) => ({
        slug: v.slug,
        name: v.name,
        type: v.type || "Venue",
        location: v.city || v.location || "",
        coordinates: null as { lat: number; lng: number } | null, // DB venues don't have coords yet
        wallSpace: v.wall_space || "",
        approximateFootfall: v.approximate_footfall || "",
        preferredStyles: v.preferred_styles || [],
        preferredThemes: v.preferred_themes || [],
        interestedInFreeLoan: v.interested_in_free_loan ?? true,
        interestedInRevenueShare: v.interested_in_revenue_share ?? false,
        interestedInDirectPurchase: v.interested_in_direct_purchase ?? false,
        description: v.description || "",
        image: v.image || "",
        source: "database" as const,
      })),
      ...staticOnly.map((v) => ({
        slug: v.slug,
        name: v.name,
        type: v.type,
        location: v.location,
        coordinates: v.coordinates,
        wallSpace: v.wallSpace,
        approximateFootfall: v.approximateFootfall,
        preferredStyles: v.preferredStyles,
        preferredThemes: v.preferredThemes,
        interestedInFreeLoan: v.interestedInFreeLoan,
        interestedInRevenueShare: v.interestedInRevenueShare,
        interestedInDirectPurchase: v.interestedInDirectPurchase,
        description: v.description,
        image: v.image,
        source: "static" as const,
      })),
    ];

    // Aggregate stats
    const stats = {
      total: allVenues.length,
      openToDisplay: allVenues.filter((v) => v.interestedInFreeLoan || v.interestedInRevenueShare).length,
      openToPurchase: allVenues.filter((v) => v.interestedInDirectPurchase).length,
      openToRevenueShare: allVenues.filter((v) => v.interestedInRevenueShare).length,
      byType: {} as Record<string, number>,
    };

    for (const v of allVenues) {
      const t = v.type || "Other";
      stats.byType[t] = (stats.byType[t] || 0) + 1;
    }

    return NextResponse.json({ venues: allVenues, stats });
  } catch {
    return NextResponse.json({ venues: [], stats: { total: 0, openToDisplay: 0, openToPurchase: 0, openToRevenueShare: 0, byType: {} } });
  }
}
