import { NextResponse, type NextRequest } from "next/server";
import { trackEvent, extractTrackingContext, generateVisitorId } from "@/lib/analytics";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_EVENTS = new Set([
  "venue_viewed_artist",
  "artwork_view",
  "profile_view",
]);

/**
 * Client-side analytics tracking endpoint.
 * Accepts events from browser JS (venue views, artwork lightbox opens, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event_type, artist_slug, work_id, venue_user_id } = body;

    if (!event_type || !ALLOWED_EVENTS.has(event_type)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    const ctx = extractTrackingContext(request.headers);
    const visitorId = generateVisitorId(ctx.ip, ctx.userAgent);

    // Basic dedup: skip if same visitor+event+slug within last 60s
    const db = getSupabaseAdmin();
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", visitorId)
      .eq("event_type", event_type)
      .eq("artist_slug", artist_slug || "")
      .gte("created_at", oneMinuteAgo);

    if (count && count > 0) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    trackEvent({
      event_type,
      artist_slug: artist_slug || undefined,
      work_id: work_id || undefined,
      venue_user_id: venue_user_id || undefined,
      visitor_id: visitorId,
      referrer: ctx.referrer || undefined,
      source: "browse",
    }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
