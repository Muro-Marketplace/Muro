import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { venues as staticVenues } from "@/data/venues";
import { getOptionalUser } from "@/lib/api-auth";
import { resolveSubscription } from "@/lib/subscriptions";
import { canSeeVenueIdentity, redactVenueDetail } from "@/lib/venue-visibility";

// Public read of a single venue profile by slug. Used by /venues/[slug]
// and the "View how artists see your profile" link from venue-portal.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Valid slug required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // Pull the complete venue profile, including the fields only the
  // editor sets (display needs, gallery). Optional columns fall back
  // gracefully if the migration isn't applied.
  let { data } = await db
    .from("venue_profiles")
    .select("user_id, slug, name, type, location, city, postcode, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) {
    // Older envs: retry with the lean select
    const fallback = await db
      .from("venue_profiles")
      .select("user_id, slug, name, type, location, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes")
      .eq("slug", slug)
      .maybeSingle();
    data = (fallback.data as typeof data) || null;
  }

  if (data) {
    // postcode (exact address) is paywalled. The owner always sees it;
    // otherwise only subscribed artists / customers do. Anon callers get
    // it nulled. The internal owner user_id is never exposed.
    const row = data as Record<string, unknown>;
    const ownerId = typeof row.user_id === "string" ? row.user_id : null;
    const { user } = await getOptionalUser(req);
    let entitled = false;
    if (user) {
      if (ownerId && user.id === ownerId) {
        entitled = true;
      } else {
        const role = (user.user_metadata?.user_type as string | undefined) ?? null;
        const sub = await resolveSubscription(user.id);
        entitled = canSeeVenueIdentity(role, sub.active);
      }
    }
    const venue = { ...row };
    delete venue.user_id;
    return NextResponse.json({
      venue: redactVenueDetail(venue, entitled),
      source: "database" as const,
    });
  }

  // Fall back to the static demo data so seed venues (the ones that
  // power the marketing pages) still resolve.
  const seed = staticVenues.find((v) => v.slug === slug);
  if (!seed) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  return NextResponse.json({
    venue: {
      slug: seed.slug,
      name: seed.name,
      type: seed.type,
      location: seed.location,
      city: seed.location,
      postcode: null,
      wall_space: seed.wallSpace,
      description: seed.description,
      image: seed.image,
      images: Array.isArray(seed.images) ? seed.images : [],
      approximate_footfall: seed.approximateFootfall,
      audience_type: seed.audienceType,
      interested_in_free_loan: seed.interestedInFreeLoan,
      interested_in_revenue_share: seed.interestedInRevenueShare,
      interested_in_direct_purchase: seed.interestedInDirectPurchase,
      preferred_styles: seed.preferredStyles,
      preferred_themes: seed.preferredThemes,
      display_wall_space: seed.displayWallSpace || "",
      display_lighting: seed.displayLighting || "",
      display_install_notes: seed.displayInstallNotes || "",
      display_rotation_frequency: seed.displayRotationFrequency || "",
    },
    source: "static" as const,
  });
}
