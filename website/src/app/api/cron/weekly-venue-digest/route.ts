// Vercel Cron, Wednesday 09:00 UTC.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { VenueWeeklyDigest } from "@/emails/templates/venue-lifecycle/VenueWeeklyDigest";
import { requireCronAuth, runBatch, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStartLabel = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const weekEndLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const { data: venues } = await db
    .from("venue_profiles")
    .select("user_id, name, slug, created_at")
    .not("user_id", "is", null)
    .lte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

  const result = await runBatch(venues || [], async (venue) => {
    if (!venue.user_id) return;

    const [{ count: viewCount }, { count: requestCount }, { count: activeCount }] = await Promise.all([
      // `analytics_events` has NO `venue_slug`. It carries `venue_user_id` and
      // `venue_name`. PostgREST rejected the whole query, so `viewCount` was
      // always null: the digest reported zero views for every venue, and the
      // "fewer than 3 events, do not send" gate below counted them as zero too,
      // so venues whose week was mostly views were skipped entirely.
      db.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event_type", "venue_view").eq("venue_user_id", venue.user_id).gte("created_at", weekAgo),
      db.from("placements").select("id", { count: "exact", head: true })
        .eq("venue_user_id", venue.user_id).eq("status", "pending").gte("created_at", weekAgo),
      db.from("placements").select("id", { count: "exact", head: true })
        .eq("venue_user_id", venue.user_id).eq("status", "active"),
    ]);

    const totalEvents = (viewCount ?? 0) + (requestCount ?? 0) + (activeCount ?? 0);
    if (totalEvents < 3) return;

    const { data: { user } } = await db.auth.admin.getUserById(venue.user_id);
    if (!user?.email) return;

    await sendEmail({
      idempotencyKey: `venue_weekly_digest:${venue.user_id}:${weekStartLabel}`,
      template: "venue_weekly_digest",
      category: "digests",
      to: user.email,
      subject: `${venue.name}'s week on Wallplace`,
      userId: venue.user_id,
      react: VenueWeeklyDigest({
        firstName: (venue.name || "there").split(" ")[0],
        venueName: venue.name || "your venue",
        weekStart: weekStartLabel,
        weekEnd: weekEndLabel,
        profileViews: viewCount ?? 0,
        placementRequests: requestCount ?? 0,
        activePlacements: activeCount ?? 0,
        // H24: `artistMatches: 0` and `suggestedArtists: []` used to be passed
        // on every send. Neither had a source: artist-to-venue matching does
        // not exist. The stat is gone from the template and the suggestion
        // block only renders when a list is supplied, so nothing here fabricates
        // a zero. Populate `suggestedArtists` here the day matching lands.
        dashboardUrl: `${SITE}/venue-portal`,
      }),
      metadata: { week: weekStartLabel },
    });
  });

  // WS6.5: all-failed runs 500 and alert admin; partial failure stays 200.
  return finishCronRun("weekly-venue-digest", result, { ...result });
}
