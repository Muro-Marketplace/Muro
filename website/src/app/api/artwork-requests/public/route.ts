// /api/artwork-requests/public — artist-only listing of open venue-posted
// artwork requests for the artist-facing /artwork-requests and
// /spaces?view=requests surfaces.
//
// Despite the legacy "public" path, this is gated to authenticated
// artists. Venues see their own demand in their portal; venues looking
// at venues, customers, and anonymous visitors shouldn't be able to
// scrape the active-demand feed. The list itself stays the curated
// subset of safe fields (no private/invitation columns).
//
// No FK between artwork_requests.venue_user_id and venue_profiles, so
// we fetch in two passes and merge by user_id.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

interface RawRequest {
  id: string;
  venue_user_id: string;
  venue_slug: string | null;
  title: string;
  description: string;
  intent: string[] | null;
  styles: string[] | null;
  mediums: string[] | null;
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  qr_revenue_share_percent: number | null;
  location: string | null;
  timescale: string | null;
  created_at: string;
}

interface VenueLookup {
  user_id: string;
  slug: string | null;
  name: string | null;
  type: string | null;
  location: string | null;
  image: string | null;
}

export async function GET(request: Request) {
  // Artist-gate: require a signed-in user who has an artist_profile
  // row. Anonymous + venues + customers are blocked at the API boundary
  // so a direct fetch can't bypass the UI gate in ArtworkRequestsList.
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();
  const { data: artistRow } = await db
    .from("artist_profiles")
    .select("id")
    .eq("user_id", auth.user!.id)
    .maybeSingle<{ id: string }>();
  if (!artistRow) {
    return NextResponse.json(
      { error: "Open requests are only available to Wallplace artists." },
      { status: 403 },
    );
  }

  const { data: rows, error } = await db
    .from("artwork_requests")
    .select(
      "id, venue_user_id, venue_slug, title, description, intent, styles, mediums, budget_min_pence, budget_max_pence, qr_revenue_share_percent, location, timescale, created_at",
    )
    .eq("status", "open")
    .eq("visibility", "semi_public")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[artwork-requests/public GET]", error);
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }

  const requests = (rows || []) as RawRequest[];
  const userIds = Array.from(new Set(requests.map((r) => r.venue_user_id))).filter(Boolean);

  let venueByUserId = new Map<string, VenueLookup>();
  if (userIds.length > 0) {
    const { data: venues } = await db
      .from("venue_profiles")
      .select("user_id, slug, name, type, location, image")
      .in("user_id", userIds);
    venueByUserId = new Map((venues || []).map((v) => [v.user_id as string, v as VenueLookup]));
  }

  const out = requests.map((r) => {
    const v = venueByUserId.get(r.venue_user_id);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      intent: r.intent || [],
      styles: r.styles || [],
      mediums: r.mediums || [],
      budget_min_pence: r.budget_min_pence,
      budget_max_pence: r.budget_max_pence,
      qr_revenue_share_percent: r.qr_revenue_share_percent,
      location: r.location,
      timescale: r.timescale,
      created_at: r.created_at,
      venue_slug: v?.slug || r.venue_slug,
      venue_name: v?.name || "Venue",
      venue_type: v?.type || null,
      venue_location: v?.location || null,
      venue_image: v?.image || null,
    };
  });

  return NextResponse.json({ requests: out });
}
