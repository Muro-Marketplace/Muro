import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Artist, ArtistWork, SizePricing } from "@/data/artists";
import type { DisciplineId } from "@/data/categories";

export interface DbArtistProfile {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  profile_image: string;
  banner_image: string;
  short_bio: string;
  extended_bio: string;
  location: string;
  primary_medium: string;
  style_tags: string[];
  themes: string[];
  /** Phase 3 taxonomy. */
  discipline?: string | null;
  sub_styles?: string[] | null;
  instagram: string;
  website: string;
  offers_originals: boolean;
  offers_prints: boolean;
  offers_framed: boolean;
  available_sizes: string[];
  open_to_commissions: boolean;
  open_to_free_loan: boolean;
  open_to_revenue_share: boolean;
  revenue_share_percent: number;
  open_to_outright_purchase: boolean;
  can_provide_frames: boolean;
  can_arrange_framing: boolean;
  delivery_radius: string;
  venue_types_suited_for: string[];
  is_founding_artist: boolean;
  profile_color: string;
  postcode?: string;
  lat?: number | null;
  lng?: number | null;
  total_views?: number;
  total_placements?: number;
  total_sales?: number;
  total_enquiries?: number;
  message_notifications_enabled?: boolean;
  subscription_plan?: string;
  default_shipping_price?: number | null;
  ships_internationally?: boolean;
  international_shipping_price?: number | null;
  /** "pending" for new claim-flow profiles; "approved" once admin reviews. */
  review_status?: "pending" | "approved" | "rejected";
  approved_at?: string | null;
}

export interface DbArtistWork {
  id: string;
  artist_id: string;
  title: string;
  medium: string;
  dimensions: string;
  price_band: string;
  pricing: SizePricing[];
  available: boolean;
  color: string;
  image: string;
  orientation: string;
  sort_order: number;
  shipping_price?: number | null;
  in_store_price?: number | null;
  quantity_available?: number | null;
  frame_options?: { label: string; priceUplift: number }[];
  description?: string;
  images?: string[];
  /** Postgres `timestamptz`, ISO string from PostgREST. Powers the
   *  marketplace "Recently listed" sort (#5). */
  created_at?: string;
  /** Migration 038: denormalised venue display name and active placement
   *  pointer. Kept in sync by the placements PATCH handler. */
  placed_at_venue?: string | null;
  current_placement_id?: string | null;
}

/** Convert a DB profile row + works to the Artist shape used everywhere in the app */
export function dbProfileToArtist(profile: DbArtistProfile, works: DbArtistWork[]): Artist {
  return {
    slug: profile.slug,
    name: profile.name,
    profileColor: profile.profile_color,
    shortBio: profile.short_bio,
    extendedBio: profile.extended_bio,
    location: profile.location,
    primaryMedium: profile.primary_medium,
    styleTags: profile.style_tags || [],
    discipline: (profile.discipline || undefined) as DisciplineId | undefined,
    subStyles: profile.sub_styles || [],
    instagram: profile.instagram || "",
    website: profile.website || undefined,
    offersOriginals: profile.offers_originals,
    offersPrints: profile.offers_prints,
    offersFramed: profile.offers_framed,
    availableSizes: profile.available_sizes || [],
    openToCommissions: profile.open_to_commissions ?? true,
    isFoundingArtist: profile.is_founding_artist,
    themes: profile.themes || [],
    deliveryRadius: profile.delivery_radius,
    // Default to "open" when the DB flag is null/undefined. Legacy artist
    // rows created before these columns existed were being filtered out
    // from venue arrangement filters (#10) even though the artist hadn't
    // opted out. Better to show them and let the venue enquire than to
    // hide them by default.
    openToFreeLoan: profile.open_to_free_loan ?? true,
    openToRevenueShare: profile.open_to_revenue_share ?? true,
    revenueSharePercent: profile.revenue_share_percent,
    openToOutrightPurchase: profile.open_to_outright_purchase ?? true,
    canProvideFrames: profile.can_provide_frames,
    canArrangeFraming: profile.can_arrange_framing,
    venueTypesSuitedFor: profile.venue_types_suited_for || [],
    postcode: profile.postcode || "",
    coordinates:
      profile.lat != null && profile.lng != null
        ? { lat: profile.lat, lng: profile.lng }
        : null,
    image: profile.profile_image || `https://picsum.photos/seed/${profile.slug}/400/400`,
    bannerImage: profile.banner_image || undefined,
    totalViews: profile.total_views || 0,
    totalPlacements: profile.total_placements || 0,
    totalSales: profile.total_sales || 0,
    totalEnquiries: profile.total_enquiries || 0,
    subscriptionPlan: profile.subscription_plan || undefined,
    shipsInternationally: profile.ships_internationally || false,
    internationalShippingPrice: profile.international_shipping_price ?? undefined,
    // Plan F #12: a profile reaches the public app only after
    // review_status flips to "approved" (legacy rows without the
    // column are treated as approved by getAllDatabaseArtists).
    // Either path means the artist passed admin review, so surface
    // that as a Verified trust signal on the public profile.
    isVerified:
      profile.review_status === "approved" || profile.review_status == null,
    works: works.map((w) => ({
      id: w.id,
      title: w.title,
      medium: w.medium,
      dimensions: w.dimensions,
      priceBand: w.price_band,
      pricing: w.pricing || [],
      available: w.available,
      color: w.color,
      image: w.image,
      images: Array.isArray(w.images) ? w.images : [],
      description: w.description || "",
      orientation: (w.orientation as "portrait" | "landscape" | "square") || undefined,
      shippingPrice: w.shipping_price ?? undefined,
      inStorePrice: w.in_store_price ?? undefined,
      quantityAvailable: w.quantity_available ?? undefined,
      frameOptions: Array.isArray(w.frame_options) ? w.frame_options : [],
      createdAt: w.created_at ?? undefined,
      placed_at_venue: w.placed_at_venue ?? null,
      current_placement_id: w.current_placement_id ?? null,
    })),
  };
}

export async function getArtistProfileByUserId(userId: string) {
  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("artist_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;

  const { data: works } = await db
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  return { profile: profile as DbArtistProfile, works: (works || []) as DbArtistWork[] };
}

export async function getArtistProfileBySlug(slug: string) {
  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("artist_profiles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!profile) return null;

  const { data: works } = await db
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  return { profile: profile as DbArtistProfile, works: (works || []) as DbArtistWork[] };
}

export async function getAllDatabaseArtists(): Promise<Artist[]> {
  // Only surface profiles the admin has approved. Profiles created through
  // /apply/claim default to pending and stay hidden until review_status
  // flips to "approved". Legacy rows without the column get treated as
  // approved (the query below falls back if the column doesn't exist yet).
  let profiles: unknown[] | null = null;
  {
    const res = await supabase
      .from("artist_profiles")
      .select("*")
      .eq("review_status", "approved")
      .order("created_at", { ascending: false });
    if (res.error && /review_status/.test(res.error.message)) {
      // Column not yet migrated, fall back to the old behaviour.
      const all = await supabase
        .from("artist_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      profiles = all.data;
    } else {
      profiles = res.data;
    }
  }

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p) => (p as { id: string }).id);
  const { data: allWorks } = await supabase
    .from("artist_works")
    .select("*")
    .in("artist_id", profileIds)
    .order("sort_order", { ascending: true });

  return profiles.map((profile) => {
    const p = profile as DbArtistProfile;
    const works = (allWorks || []).filter((w) => w.artist_id === p.id);
    return dbProfileToArtist(p, works as DbArtistWork[]);
  });
}

export async function upsertArtistProfile(
  userId: string,
  data: Partial<Omit<DbArtistProfile, "id" | "user_id">>
) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("artist_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) {
    const { error } = await db
      .from("artist_profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { error };
  } else {
    // New row: force review_status='pending' on insert UNLESS the
    // caller explicitly passed one (e.g. an admin claim flow that
    // approves on creation). Migration 023 set the column default
    // to 'approved', which meant any artist editing their profile
    // before admin review showed up on the public marketplace
    // immediately. Code-level default flips it the other way; the
    // admin still has to flip it to 'approved' to publish.
    const insertPayload = {
      ...data,
      user_id: userId,
      review_status:
        (data as { review_status?: string }).review_status ?? "pending",
    };
    const { error } = await db.from("artist_profiles").insert(insertPayload);
    return { error };
  }
}
