import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getDateCutoff(range: string): string | null {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 86400000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 86400000).toISOString();
    case "90d":
      return new Date(now.getTime() - 90 * 86400000).toISOString();
    case "12m":
      return new Date(now.getTime() - 365 * 86400000).toISOString();
    case "all":
      return null;
    default:
      return new Date(now.getTime() - 30 * 86400000).toISOString();
  }
}

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (error) return error;

  const db = getSupabaseAdmin();

  // Get artist slug from profile
  const { data: profile } = await db
    .from("artist_profiles")
    .select("slug, subscription_plan")
    .eq("user_id", user!.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
  }

  const range = request.nextUrl.searchParams.get("range") || "30d";
  const cutoff = getDateCutoff(range);

  // Build base query filter
  let eventsQuery = db
    .from("analytics_events")
    .select("event_type, work_id, venue_user_id, source, created_at")
    .eq("artist_slug", profile.slug);

  if (cutoff) {
    eventsQuery = eventsQuery.gte("created_at", cutoff);
  }

  const { data: events } = await eventsQuery.order("created_at", { ascending: true });
  const allEvents = events || [];

  // Compute totals
  const totals = {
    profile_views: 0,
    artwork_views: 0,
    qr_scans: 0,
    enquiries: 0,
    venue_views: 0,
  };

  const workViewCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const viewsByDate: Record<string, { profile_views: number; artwork_views: number; qr_scans: number }> = {};

  for (const event of allEvents) {
    const date = event.created_at.split("T")[0];

    if (!viewsByDate[date]) {
      viewsByDate[date] = { profile_views: 0, artwork_views: 0, qr_scans: 0 };
    }

    switch (event.event_type) {
      case "profile_view":
        totals.profile_views++;
        viewsByDate[date].profile_views++;
        break;
      case "artwork_view":
        totals.artwork_views++;
        viewsByDate[date].artwork_views++;
        if (event.work_id) {
          workViewCounts[event.work_id] = (workViewCounts[event.work_id] || 0) + 1;
        }
        break;
      case "qr_scan":
        totals.qr_scans++;
        viewsByDate[date].qr_scans++;
        // Count QR scans against the work too, without this the
        // top-works ranking only reflects artwork_view events from
        // /browse/[slug]/[workSlug], so a piece doing well on
        // physical labels would never surface here.
        if (event.work_id) {
          workViewCounts[event.work_id] = (workViewCounts[event.work_id] || 0) + 1;
        }
        break;
      case "venue_viewed_artist":
        totals.venue_views++;
        break;
    }

    const src = event.source || "direct";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  // Count enquiries from enquiries table
  let enquiriesQuery = db
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("artist_slug", profile.slug);

  if (cutoff) {
    enquiriesQuery = enquiriesQuery.gte("created_at", cutoff);
  }

  const { count: enquiryCount } = await enquiriesQuery;
  totals.enquiries = enquiryCount || 0;

  // Views over time
  const views_over_time = Object.entries(viewsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  // Top works by views, enrich with titles. Drop rows whose work_id
  // no longer resolves to a live artist_works row (deleted works
  // still own legacy view events). QA flagged the list showing raw
  // slugs like "fin-coles-1775872509197", which the artist has no
  // way to identify.
  const topWorkIds = Object.entries(workViewCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20); // pull more so the post-filter still shows 10

  let workTitleMap: Record<string, string> = {};
  if (topWorkIds.length > 0) {
    const ids = topWorkIds.map(([id]) => id);
    const { data: works } = await db
      .from("artist_works")
      .select("id, title")
      .in("id", ids);
    if (works) {
      workTitleMap = Object.fromEntries(works.map((w) => [w.id, w.title]));
    }
  }

  // Two works can legitimately share a title (the artist duplicated
  // a row and never cleaned up). Showing the same title twice with
  // different view counts is confusing, so we aggregate by lowercase
  // title and keep the work_id of the most-viewed copy for the link
  // target. The sum of views is what the artist actually wants to
  // see for that title.
  const byTitle: Record<string, { work_id: string; title: string; views: number }> = {};
  for (const [work_id, views] of topWorkIds) {
    const title = workTitleMap[work_id];
    if (!title) continue; // skip unresolved (deleted) work rows
    const key = title.trim().toLowerCase();
    const existing = byTitle[key];
    if (!existing || existing.views < views) {
      byTitle[key] = {
        work_id,
        title,
        views: (existing?.views || 0) + views,
      };
    } else {
      existing.views += views;
    }
  }

  const top_works = Object.values(byTitle)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Traffic sources
  const traffic_sources = Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => ({ source, count }));

  // Venue viewers - gated to Premium/Pro
  let venue_viewers: { venue_name: string; venue_type: string; viewed_at: string }[] | null = null;

  const isPremium = profile.subscription_plan === "premium" || profile.subscription_plan === "pro";

  if (isPremium) {
    // Get unique venue viewer user IDs
    const venueEvents = allEvents.filter(
      (e) => e.event_type === "venue_viewed_artist" && e.venue_user_id
    );

    const uniqueVenueIds = [...new Set(venueEvents.map((e) => e.venue_user_id))];

    if (uniqueVenueIds.length > 0) {
      const { data: venues } = await db
        .from("venue_profiles")
        .select("user_id, name, type")
        .in("user_id", uniqueVenueIds);

      const venueMap = new Map(
        (venues || []).map((v) => [v.user_id, { name: v.name, type: v.type }])
      );

      venue_viewers = venueEvents
        .filter((e) => venueMap.has(e.venue_user_id))
        .reduce<{ venue_name: string; venue_type: string; viewed_at: string }[]>((acc, e) => {
          const venue = venueMap.get(e.venue_user_id)!;
          // Deduplicate by venue
          if (!acc.some((v) => v.venue_name === venue.name)) {
            acc.push({
              venue_name: venue.name,
              venue_type: venue.type,
              viewed_at: e.created_at,
            });
          }
          return acc;
        }, [])
        .slice(0, 20);
    } else {
      venue_viewers = [];
    }
  }

  return NextResponse.json({
    totals,
    views_over_time,
    top_works,
    traffic_sources,
    venue_viewers,
    venue_viewer_count: totals.venue_views,
    is_premium: isPremium,
  });
}
