import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET: return unread message count for the authenticated user
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    // Find the user's slug (artist or venue)
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", auth.user!.id)
      .single();

    const slug = artistProfile?.slug;
    if (!slug) {
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("slug")
        .eq("user_id", auth.user!.id)
        .single();
      if (!venueProfile?.slug) {
        return NextResponse.json({ count: 0 });
      }
      // Count unread for venue
      const { count } = await db
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("recipient_slug", venueProfile.slug)
        .eq("is_read", false);
      return NextResponse.json({ count: count || 0 });
    }

    // Count unread for artist
    const { count } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient_slug", slug)
      .eq("is_read", false);

    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
