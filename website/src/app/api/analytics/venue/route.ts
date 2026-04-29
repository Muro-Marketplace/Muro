// Venue analytics endpoint. Mirrors /api/analytics/artist but
// scopes events to the venue side of the QR scan: we count rows
// where `venue_user_id` matches the requesting venue (preferred)
// OR where `venue_name` matches the venue's display name (legacy
// fallback for QR labels printed before the user_id-resolution
// flow landed).
//
// The venue analytics page shows totals + top scanned works + top
// scanning artists so a venue can see which placements are pulling
// real attention.

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

  // Resolve the venue profile so we can scope events.
  const { data: profile } = await db
    .from("venue_profiles")
    .select("user_id, slug, name")
    .eq("user_id", user!.id)
    .maybeSingle<{ user_id: string; slug: string; name: string }>();

  if (!profile) {
    return NextResponse.json({ error: "Venue profile not found" }, { status: 404 });
  }

  const range = request.nextUrl.searchParams.get("range") || "30d";
  const cutoff = getDateCutoff(range);

  // Two queries OR'd together so we pick up QR scans that came in
  // before we started capturing venue_user_id.
  let query = db
    .from("analytics_events")
    .select("event_type, work_id, artist_slug, source, created_at, venue_user_id, venue_name")
    .eq("event_type", "qr_scan")
    .or(`venue_user_id.eq.${profile.user_id},venue_name.eq.${profile.name}`);
  if (cutoff) query = query.gte("created_at", cutoff);

  const { data: events, error: queryError } = await query.order("created_at", { ascending: true });
  if (queryError) {
    console.error("[analytics/venue] query failed:", queryError.message);
    return NextResponse.json({ error: "Analytics query failed" }, { status: 500 });
  }
  const allEvents = events || [];

  const totals = { qr_scans: allEvents.length };
  const scansByDate: Record<string, number> = {};
  const workScanCounts: Record<string, number> = {};
  const artistScanCounts: Record<string, number> = {};

  for (const event of allEvents) {
    const date = event.created_at.split("T")[0];
    scansByDate[date] = (scansByDate[date] || 0) + 1;
    if (event.work_id) workScanCounts[event.work_id] = (workScanCounts[event.work_id] || 0) + 1;
    if (event.artist_slug) artistScanCounts[event.artist_slug] = (artistScanCounts[event.artist_slug] || 0) + 1;
  }

  // Resolve top-scanned work ids → titles + artist slugs.
  const topWorkIds = Object.entries(workScanCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  let workMeta: Record<string, { title: string; artist_slug: string | null }> = {};
  if (topWorkIds.length > 0) {
    const ids = topWorkIds.map(([id]) => id);
    const { data: works } = await db
      .from("artist_works")
      .select("id, title, artist_id")
      .in("id", ids);
    if (works) {
      // Resolve artist_id → slug in one batch.
      const artistIds = [...new Set(works.map((w) => w.artist_id).filter(Boolean))];
      const { data: artists } = artistIds.length > 0
        ? await db.from("artist_profiles").select("id, slug").in("id", artistIds)
        : { data: [] as Array<{ id: string; slug: string }> };
      const artistById = new Map<string, string>();
      for (const a of artists || []) artistById.set(a.id, a.slug);
      workMeta = Object.fromEntries(
        works.map((w) => [w.id, { title: w.title, artist_slug: artistById.get(w.artist_id) || null }]),
      );
    }
  }
  const top_works = topWorkIds.map(([work_id, scans]) => ({
    work_id,
    title: workMeta[work_id]?.title || "Unknown work",
    artist_slug: workMeta[work_id]?.artist_slug || null,
    scans,
  }));

  // Resolve top-scanned artist slugs → display names.
  const topArtistSlugs = Object.entries(artistScanCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  let artistNameMap: Record<string, string> = {};
  if (topArtistSlugs.length > 0) {
    const slugs = topArtistSlugs.map(([s]) => s);
    const { data: artists } = await db
      .from("artist_profiles")
      .select("slug, name")
      .in("slug", slugs);
    if (artists) artistNameMap = Object.fromEntries(artists.map((a) => [a.slug, a.name]));
  }
  const top_artists = topArtistSlugs.map(([artist_slug, scans]) => ({
    artist_slug,
    artist_name: artistNameMap[artist_slug] || artist_slug,
    scans,
  }));

  const scans_over_time = Object.entries(scansByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scans]) => ({ date, scans }));

  // Placement-attributed revenue. The placements.revenue column is kept
  // in sync by the orders PATCH handler when an order transitions to
  // delivered (see migration 038's increment_placement_revenue). Adds
  // the row-level breakdown here so a venue dashboard can show "X£
  // earned from placement Y" alongside the QR scan stats.
  const { data: placementRows } = await db
    .from("placements")
    .select("id, artist_slug, work_id, work_title, status, delivery_count, revenue")
    .eq("venue_user_id", profile.user_id);
  const placement_revenue = (placementRows || []).map((p) => ({
    placementId: p.id,
    artistSlug: p.artist_slug,
    workId: p.work_id,
    workTitle: p.work_title,
    status: p.status,
    deliveryCount: (p as { delivery_count?: number }).delivery_count ?? 0,
    revenue: Number(p.revenue ?? 0),
  }));
  const placement_revenue_total = placement_revenue.reduce((sum, r) => sum + r.revenue, 0);

  return NextResponse.json({
    totals,
    scans_over_time,
    top_works,
    top_artists,
    placement_revenue,
    placement_revenue_total,
    range,
  });
}
