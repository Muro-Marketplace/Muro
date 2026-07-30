import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistProfileByUserId, upsertArtistProfile } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId } from "@/lib/db/artist-works";
import { geocodePostcode } from "@/lib/geocode";
import { pickWritable, ARTIST_PROFILE_WRITABLE } from "@/lib/db/writable-fields";

// GET: fetch the current user's artist profile
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const result = await getArtistProfileByUserId(auth.user!.id);

  if (!result) {
    return NextResponse.json({ profile: null, works: [] });
  }

  return NextResponse.json({
    profile: result.profile,
    works: result.works,
  });
}

// UK postcode validator. Permissive form that matches anything the
// Royal Mail recognises (AA9A 9AA, A9A 9AA, A9 9AA, A99 9AA, AA9 9AA,
// AA99 9AA). Space between outward and inward is optional, and we
// normalise to upper-case before matching. Used by both the artist and
// venue profile editors so silently-stored garbage like "NOT A
// POSTCODE 12345" can't break the proximity-search index.
const UK_POSTCODE_RE =
  /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;

// PUT: update the current user's artist profile
export async function PUT(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();

    // E44. This used to be `{ ...body }`, which handed the client the whole
    // artist_profiles row through a service-role write: self-approve moderation
    // (review_status), self-grant Pro (subscription_plan/status), extend the
    // trial, and set stripe_connect_account_id, which is where payouts land.
    // Chained with E32 that is a complete theft: take a listing, redirect the
    // payout, get paid for someone else's art.
    //
    // Everything the client may set now comes through the allowlist. Keys absent
    // from the body are omitted rather than nulled, so a partial edit stays
    // partial. lat/lng are deliberately NOT on the allowlist and are set below
    // from the geocoder, server-side.
    const updatePayload: Record<string, unknown> = pickWritable(
      body,
      ARTIST_PROFILE_WRITABLE,
    );
    if (typeof body.postcode === "string" && body.postcode.trim()) {
      const cleaned = body.postcode.trim();
      if (!UK_POSTCODE_RE.test(cleaned)) {
        return NextResponse.json(
          {
            error: "invalid_postcode",
            message:
              "Enter a valid UK postcode (e.g. SW1A 1AA). Leave blank if you'd rather not list a location.",
          },
          { status: 400 },
        );
      }
      updatePayload.postcode = cleaned.toUpperCase();
      const coords = await geocodePostcode(cleaned);
      updatePayload.lat = coords?.lat ?? null;
      updatePayload.lng = coords?.lng ?? null;
    }

    // Numeric guardrails: shipping prices can never be negative.
    // Without this the artist UI can post any value through; the price
    // appears on the checkout flow as-is, which would let buyers see
    // an effective discount through a "negative" shipping line.
    // Both prices, since migration 081 made international_shipping_price a real
    // column and put it back on the allowlist. It reaches updatePayload again, so
    // it needs the same guard the UK price has always had.
    for (const key of ["default_shipping_price", "international_shipping_price"] as const) {
      const v = updatePayload[key];
      if (v === null || v === undefined || v === "") continue;
      const num = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json(
          {
            error: "invalid_shipping_price",
            message: "Shipping prices must be zero or greater.",
          },
          { status: 400 },
        );
      }
      updatePayload[key] = num;
    }

    // Premium+ tier gate for theme fields. Strip them for Core artists so a
    // downgraded user can't keep a paid theme live by editing unrelated fields.
    // Being on the allowlist is not the gate: the theme fields are writable in
    // principle, and this check is what decides whether they persist.
    if ("profile_theme" in updatePayload || "label_theme" in updatePayload) {
      const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
      const { canCustomiseTheme } = await import("@/lib/profile-themes");
      const { data: existing } = await getSupabaseAdmin()
        .from("artist_profiles")
        .select("subscription_plan")
        .eq("user_id", auth.user!.id)
        .maybeSingle<{ subscription_plan: string | null }>();
      if (!canCustomiseTheme(existing?.subscription_plan)) {
        delete updatePayload.profile_theme;
        delete updatePayload.label_theme;
      }
    }

    const { error } = await upsertArtistProfile(auth.user!.id, updatePayload);

    if (error) {
      console.error("Profile update error:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: create initial artist profile (called during signup/onboarding)
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { name, slug, location, primaryMedium, shortBio, instagram, website } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    // Profiles created via the claim flow land in "pending" review. An
    // admin flips this to "approved" once they've reviewed the artist
    // application. Until then the profile is not surfaced on /browse.
    const { error } = await upsertArtistProfile(auth.user!.id, {
      slug,
      name,
      location: location || "",
      primary_medium: primaryMedium || "",
      short_bio: shortBio || "",
      instagram: instagram || "",
      website: website || "",
      review_status: "pending",
    });

    if (error) {
      console.error("Profile creation error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
