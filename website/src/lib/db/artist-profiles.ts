import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Artist, ArtistWork, SizePricing } from "@/data/artists";

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
    instagram: profile.instagram || "",
    website: profile.website || undefined,
    offersOriginals: profile.offers_originals,
    offersPrints: profile.offers_prints,
    offersFramed: profile.offers_framed,
    availableSizes: profile.available_sizes || [],
    openToCommissions: profile.open_to_commissions,
    isFoundingArtist: profile.is_founding_artist,
    themes: profile.themes || [],
    deliveryRadius: profile.delivery_radius,
    openToFreeLoan: profile.open_to_free_loan,
    openToRevenueShare: profile.open_to_revenue_share,
    revenueSharePercent: profile.revenue_share_percent,
    openToOutrightPurchase: profile.open_to_outright_purchase,
    canProvideFrames: profile.can_provide_frames,
    canArrangeFraming: profile.can_arrange_framing,
    venueTypesSuitedFor: profile.venue_types_suited_for || [],
    postcode: profile.postcode || "",
    coordinates:
      profile.lat != null && profile.lng != null
        ? { lat: profile.lat, lng: profile.lng }
        : null,
    image: profile.profile_image || `https://picsum.photos/seed/${profile.slug}/400/400`,
    totalViews: profile.total_views || 0,
    totalPlacements: profile.total_placements || 0,
    totalSales: profile.total_sales || 0,
    totalEnquiries: profile.total_enquiries || 0,
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
      orientation: (w.orientation as "portrait" | "landscape" | "square") || undefined,
    })),
  };
}

export async function getArtistProfileByUserId(userId: string) {
  const { data: profile } = await supabase
    .from("artist_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;

  const { data: works } = await supabase
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  return { profile: profile as DbArtistProfile, works: (works || []) as DbArtistWork[] };
}

export async function getArtistProfileBySlug(slug: string) {
  const { data: profile } = await supabase
    .from("artist_profiles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!profile) return null;

  const { data: works } = await supabase
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  return { profile: profile as DbArtistProfile, works: (works || []) as DbArtistWork[] };
}

export async function getAllDatabaseArtists(): Promise<Artist[]> {
  const { data: profiles } = await supabase
    .from("artist_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p) => p.id);
  const { data: allWorks } = await supabase
    .from("artist_works")
    .select("*")
    .in("artist_id", profileIds)
    .order("sort_order", { ascending: true });

  return profiles.map((profile) => {
    const works = (allWorks || []).filter((w) => w.artist_id === profile.id);
    return dbProfileToArtist(profile as DbArtistProfile, works as DbArtistWork[]);
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
    const { error } = await db
      .from("artist_profiles")
      .insert({ ...data, user_id: userId });
    return { error };
  }
}
