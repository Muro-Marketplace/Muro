import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistProfileByUserId, upsertArtistProfile } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId } from "@/lib/db/artist-works";
import { geocodePostcode } from "@/lib/geocode";

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

    // Geocode postcode if provided, store lat/lng
    const updatePayload: Record<string, unknown> = { ...body };
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
    for (const key of [
      "default_shipping_price",
      "international_shipping_price",
    ] as const) {
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
