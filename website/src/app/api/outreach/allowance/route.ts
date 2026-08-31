import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistOutreachUsage, OUTREACH_WINDOW_DAYS } from "@/lib/outreach-cap";

// GET: how much venue outreach the signed-in artist has left in the rolling
// window. The cap existed for months with no way to see it: the pricing table
// didn't mention it, the portal didn't show it, and the first an artist heard
// was a 429 in the middle of writing a request. This is what the request form
// reads so the number is on screen before anything is typed.
//
// Venues aren't capped, so a venue (or anyone without an artist profile) gets
// `applicable: false` rather than an error; the form just hides the line.
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();

  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("user_id")
    .eq("user_id", auth.user!.id)
    .maybeSingle();

  if (!artistProfile) {
    return NextResponse.json({ applicable: false });
  }

  const usage = await getArtistOutreachUsage(db, auth.user!.id);
  const unlimited = usage.limit === -1;

  return NextResponse.json({
    applicable: true,
    plan: usage.plan,
    planName: usage.planName,
    limit: unlimited ? null : usage.limit,
    used: usage.used,
    // JSON has no Infinity, so unlimited is expressed as null + the flag.
    remaining: unlimited ? null : usage.remaining,
    unlimited,
    nextSlotAt: usage.nextSlotAt,
    windowDays: OUTREACH_WINDOW_DAYS,
  });
}
