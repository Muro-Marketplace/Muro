import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { venues as staticVenues } from "@/data/venues";
import { resolveSpaceViewerAccess } from "@/lib/spaces/viewer-access";
import { canViewSpaceDetails } from "@/lib/spaces/gating";

// Single-venue read by slug. Gated by the spaces paywall policy —
// non-allowed viewers (logged-out, non-subscribed artists, venues
// browsing OTHER venues) get a 403 with an upgrade hint so the
// detail page / clients render the paywall instead of leaking the
// venue payload. Venues see their own profile (isOwnVenue allowance).
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
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

  const venueUserId =
    data && typeof (data as { user_id?: unknown }).user_id === "string"
      ? ((data as { user_id: string }).user_id)
      : null;

  const viewer = await resolveSpaceViewerAccess(request, { venueUserId });
  if (!canViewSpaceDetails(viewer)) {
    return NextResponse.json(
      {
        error: "subscription_required",
        message: "An active Wallplace subscription is required to view venue details.",
        upgrade_url: "/pricing",
      },
      { status: 403 },
    );
  }

  if (data) {
    // Bundle public walls + open artwork requests in the same envelope
    // so the client fetch only has to honour one 403 / 200 boundary.
    // Both inner loads are best-effort and degrade to empty arrays.
    const publicWalls = venueUserId ? await loadPublicWalls(db, venueUserId) : [];
    const openRequests = venueUserId
      ? await loadPublicArtworkRequests(db, venueUserId)
      : [];
    return NextResponse.json({
      venue: data,
      source: "database" as const,
      publicWalls,
      openRequests,
      viewerIsOwner: viewer.isOwnVenue ?? false,
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
    publicWalls: [],
    openRequests: [],
    viewerIsOwner: false,
  });
}

interface PublicWall {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  wall_color_hex: string;
  source_image_url?: string;
}

interface PublicArtworkRequest {
  id: string;
  title: string;
  description: string | null;
  intent: string[] | null;
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  created_at: string;
}

async function loadPublicWalls(
  db: ReturnType<typeof getSupabaseAdmin>,
  venueUserId: string,
): Promise<PublicWall[]> {
  try {
    const { data, error } = await db
      .from("walls")
      .select(
        "id, name, width_cm, height_cm, kind, wall_color_hex, source_image_path, is_public_on_profile",
      )
      .eq("user_id", venueUserId)
      .eq("is_public_on_profile", true)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    const out: PublicWall[] = [];
    for (const w of data as Array<{
      id: string;
      name: string;
      width_cm: number;
      height_cm: number;
      kind: "preset" | "uploaded";
      wall_color_hex: string;
      source_image_path: string | null;
    }>) {
      const base: PublicWall = {
        id: w.id,
        name: w.name,
        width_cm: w.width_cm,
        height_cm: w.height_cm,
        kind: w.kind,
        wall_color_hex: w.wall_color_hex,
      };
      if (w.kind === "uploaded" && w.source_image_path) {
        const { data: signed } = await db.storage
          .from("wall-photos")
          .createSignedUrl(w.source_image_path, 60 * 60);
        if (signed?.signedUrl) base.source_image_url = signed.signedUrl;
      }
      out.push(base);
    }
    return out;
  } catch {
    return [];
  }
}

async function loadPublicArtworkRequests(
  db: ReturnType<typeof getSupabaseAdmin>,
  venueUserId: string,
): Promise<PublicArtworkRequest[]> {
  try {
    const { data, error } = await db
      .from("artwork_requests")
      .select("id, title, description, intent, budget_min_pence, budget_max_pence, created_at")
      .eq("venue_user_id", venueUserId)
      .eq("status", "open")
      .eq("visibility", "semi_public")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return [];
    return (data || []) as PublicArtworkRequest[];
  } catch {
    return [];
  }
}
