import { NextResponse } from "next/server";
import { venues as staticVenues } from "@/data/venues";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const revalidate = 300; // Cache 5 minutes

/**
 * GET /api/venues/demand
 * Public — returns all venues with preferences for the demand tracker.
 * Merges static venues with database venue profiles.
 */
export async function GET(request: Request) {
  const limited = checkRateLimit(request, 30, 60000);
  if (limited) return limited;
  try {
    const db = getSupabaseAdmin();

    // Fetch DB venue profiles. Try to pull the optional gallery + display
    // columns (added in migrations 022 and 028); if the schema isn't
    // applied those columns just come back undefined and we render
    // without them.
    let dbVenues: Array<Record<string, unknown>> | null = null;
    {
      const { data, error } = await db
        .from("venue_profiles")
        .select("slug, name, type, location, city, postcode, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, interested_in_collections, preferred_styles, preferred_themes, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency")
        .order("created_at", { ascending: false });
      if (error) {
        const fallback = await db
          .from("venue_profiles")
          .select("slug, name, type, location, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, interested_in_collections, preferred_styles, preferred_themes")
          .order("created_at", { ascending: false });
        dbVenues = (fallback.data as Array<Record<string, unknown>> | null) || null;
      } else {
        dbVenues = (data as Array<Record<string, unknown>> | null) || null;
      }
    }

    const asString = (v: unknown) => (typeof v === "string" ? v : "");
    const asStringArray = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

    // Merge: DB venues override static by slug
    const dbSlugs = new Set((dbVenues || []).map((v) => v.slug as string));
    const staticOnly = staticVenues.filter((v) => !dbSlugs.has(v.slug));

    const allVenues = [
      ...(dbVenues || []).map((v) => ({
        slug: v.slug as string,
        name: v.name as string,
        type: (v.type as string) || "Venue",
        location: (v.city as string) || (v.location as string) || "",
        coordinates: null as { lat: number; lng: number } | null, // DB venues don't have coords yet
        wallSpace: (v.wall_space as string) || "",
        approximateFootfall: (v.approximate_footfall as string) || "",
        preferredStyles: asStringArray(v.preferred_styles),
        preferredThemes: asStringArray(v.preferred_themes),
        interestedInFreeLoan: (v.interested_in_free_loan as boolean | null) ?? true,
        interestedInRevenueShare: (v.interested_in_revenue_share as boolean | null) ?? false,
        interestedInDirectPurchase: (v.interested_in_direct_purchase as boolean | null) ?? false,
        description: (v.description as string) || "",
        image: (v.image as string) || "",
        // Optional gallery + display fields. Empty defaults so the client
        // can render conditionally without null-checking each one.
        images: asStringArray(v.images),
        displayWallSpace: asString(v.display_wall_space),
        displayLighting: asString(v.display_lighting),
        displayInstallNotes: asString(v.display_install_notes),
        displayRotationFrequency: asString(v.display_rotation_frequency),
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
        images: v.images || [],
        displayWallSpace: v.displayWallSpace || "",
        displayLighting: v.displayLighting || "",
        displayInstallNotes: v.displayInstallNotes || "",
        displayRotationFrequency: v.displayRotationFrequency || "",
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
