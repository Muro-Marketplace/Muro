import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistProfileByUserId, upsertArtistProfile } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId } from "@/lib/db/artist-works";

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

// PUT: update the current user's artist profile
export async function PUT(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { error } = await upsertArtistProfile(auth.user!.id, body);

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

    const { error } = await upsertArtistProfile(auth.user!.id, {
      slug,
      name,
      location: location || "",
      primary_medium: primaryMedium || "",
      short_bio: shortBio || "",
      instagram: instagram || "",
      website: website || "",
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
