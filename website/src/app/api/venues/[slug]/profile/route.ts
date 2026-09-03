import { NextResponse } from "next/server";
import { venueAcceptsArtistOutreach } from "@/lib/venues/outreach-preference";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { venues as staticVenues } from "@/data/venues";
import { getOptionalUser } from "@/lib/api-auth";
import { resolveSubscription } from "@/lib/subscriptions";
import { canSeeVenueIdentity } from "@/lib/venue-visibility";
import { isFlagOn } from "@/lib/feature-flags";
import { getWallPreviewUrls } from "@/lib/visualizer/walls-db";
import { signWallPhotoUrl } from "@/lib/venues/public-walls";

// Gated data source for the public venue profile page. Venue identity (name,
// description, photos, display needs, walls, open requests) is paywalled the
// same way the /spaces listing is: only the owner, subscribed artists, and
// customers get it. Anonymous / unsubscribed callers get a "locked" teaser
// (type + city only) so the browser never receives the identity at all.
export const dynamic = "force-dynamic";

interface VenueShape {
  slug: string;
  name: string;
  type: string | null;
  location?: string | null;
  city?: string | null;
  postcode?: string | null;
  wall_space?: string | null;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  approximate_footfall?: string | null;
  audience_type?: string | null;
  interested_in_free_loan?: boolean | null;
  interested_in_revenue_share?: boolean | null;
  interested_in_direct_purchase?: boolean | null;
  preferred_styles?: string[] | null;
  preferred_themes?: string[] | null;
  display_wall_space?: string | null;
  display_lighting?: string | null;
  display_install_notes?: string | null;
  display_rotation_frequency?: string | null;
}

interface PublicWall {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  wall_color_hex: string;
  source_image_url?: string;
  /** The preview the venue last saved from the editor, when there is one. */
  preview_image_url?: string;
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

type Db = ReturnType<typeof getSupabaseAdmin>;

async function loadVenue(
  db: Db,
  slug: string,
): Promise<{ venue: VenueShape; userId: string | null } | null> {
  try {
    let { data } = await db
      .from("venue_profiles")
      .select(
        "user_id, slug, name, type, location, city, postcode, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (!data) {
      const fallback = await db
        .from("venue_profiles")
        .select(
          "user_id, slug, name, type, location, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes",
        )
        .eq("slug", slug)
        .maybeSingle();
      data = (fallback.data as typeof data) || null;
    }
    if (data) {
      const row = data as unknown as VenueShape & { user_id?: string | null };
      return { venue: row, userId: row.user_id ?? null };
    }
  } catch {
    // fall through to seed
  }
  const seed = staticVenues.find((v) => v.slug === slug);
  if (!seed) return null;
  return {
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
      display_wall_space: seed.displayWallSpace || null,
      display_lighting: seed.displayLighting || null,
      display_install_notes: seed.displayInstallNotes || null,
      display_rotation_frequency: seed.displayRotationFrequency || null,
    },
    userId: null,
  };
}

async function loadWalls(db: Db, venueUserId: string): Promise<PublicWall[]> {
  try {
    const { data, error } = await db
      .from("walls")
      .select("id, name, width_cm, height_cm, kind, wall_color_hex, source_image_path, is_public_on_profile")
      .eq("user_id", venueUserId)
      .eq("is_public_on_profile", true)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    const out: PublicWall[] = [];
    for (const w of data as Array<{
      id: string; name: string; width_cm: number; height_cm: number;
      kind: "preset" | "uploaded"; wall_color_hex: string; source_image_path: string | null;
    }>) {
      const base: PublicWall = {
        id: w.id, name: w.name, width_cm: w.width_cm, height_cm: w.height_cm,
        kind: w.kind, wall_color_hex: w.wall_color_hex,
      };
      if (w.kind === "uploaded" && w.source_image_path) {
        const signed = await signWallPhotoUrl(db, w.source_image_path);
        if (signed) base.source_image_url = signed;
      }
      out.push(base);
    }
    // The preview the venue saved from the editor is what artists should
    // see: the wall as it was built, not the bare photo. Only walls the
    // venue made public reach this point, the gate above is unchanged.
    // Only the venue's own layouts: an artist's wall proposal is a layout
    // on this wall too, and must never become the venue's preview.
    const previews = await getWallPreviewUrls(
      out.map((w) => ({ id: w.id, user_id: venueUserId })),
      db,
    );
    for (const w of out) {
      if (previews[w.id]) w.preview_image_url = previews[w.id];
    }
    return out;
  } catch {
    return [];
  }
}

async function loadRequests(db: Db, venueUserId: string): Promise<PublicArtworkRequest[]> {
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

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Valid slug required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const loaded = await loadVenue(db, slug);
  if (!loaded) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  const { venue, userId } = loaded;

  // Entitlement: the owner always sees their own profile; everyone else needs
  // a subscription (or to be a customer), mirroring /spaces canSeeDetails.
  const { user } = await getOptionalUser(req);
  let entitled = false;
  if (user) {
    if (userId && user.id === userId) {
      entitled = true;
    } else {
      const role = (user.user_metadata?.user_type as string | undefined) ?? null;
      const sub = await resolveSubscription(user.id);
      entitled = canSeeVenueIdentity(role, sub.active);
    }
  }

  if (!entitled) {
    // Locked teaser: type + city only, nothing identifying.
    return NextResponse.json({
      locked: true,
      venue: {
        slug: venue.slug,
        type: venue.type,
        city: venue.city ?? null,
        location: venue.location ?? null,
      },
      walls: [],
      openRequests: [],
    });
  }

  // 08 §7.1 / D6 item 3: the wall kill-switch did not work.
  //
  // WALL_VISUALIZER_V1 gates the visualizer everywhere else, but this route read
  // and served `walls` unconditionally. So flipping the flag off to disable the
  // feature (which is what a kill-switch is for, including in an incident) left
  // this endpoint still publishing every venue's public wall list, complete with
  // storage paths for uploaded wall photos.
  //
  // A kill-switch with a hole in it is worse than no kill-switch: it is one
  // someone will reach for under pressure and believe.
  const wallsEnabled = isFlagOn("WALL_VISUALIZER_V1");
  const [walls, openRequests] = await Promise.all([
    userId && wallsEnabled ? loadWalls(db, userId) : Promise.resolve([]),
    userId ? loadRequests(db, userId) : Promise.resolve([]),
  ]);

  // Never expose the owner's internal user_id or exact postcode publicly.
  const { postcode: _pc, user_id: _uid, ...safeVenue } = venue as VenueShape & {
    postcode?: string | null;
    user_id?: string | null;
  };
  void _pc;
  void _uid;
  // Whether artists may approach this venue first (settings opt-out).
  const acceptsArtistOutreach = await venueAcceptsArtistOutreach(db, userId);
  return NextResponse.json({
    locked: false,
    venue: { ...safeVenue, acceptsArtistOutreach },
    walls,
    openRequests,
  });
}
