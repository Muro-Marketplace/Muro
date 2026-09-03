// Vercel Cron, Wednesday 09:00 UTC.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { VenueWeeklyDigest } from "@/emails/templates/venue-lifecycle/VenueWeeklyDigest";
import type { Artist } from "@/emails/types/emailTypes";
import { rankArtistsForVenueDigest, type RecommendableArtist } from "@/lib/venue-recommendations";
import { requireCronAuth, runBatch, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/** A candidate row: the ranking fields plus what the email card needs to show. */
interface CandidateArtist extends RecommendableArtist {
  id: string;
  primary_medium: string | null;
  location: string | null;
}

/** DB row shape from the `artist_profiles` select below. No `image` column
 *  exists (see schema-columns.json); the picture lives in `profile_image`. */
interface ArtistProfileRow {
  id: string;
  slug: string;
  name: string;
  profile_image: string | null;
  review_status: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string | null;
  primary_medium: string | null;
  location: string | null;
}

function toCandidateArtist(row: ArtistProfileRow): CandidateArtist {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.profile_image,
    review_status: row.review_status,
    subscription_status: row.subscription_status,
    subscription_plan: row.subscription_plan,
    created_at: row.created_at,
    primary_medium: row.primary_medium,
    location: row.location,
  };
}

/** The template's `Artist` shape needs a non-empty avatar; fall back to the
 *  same picsum placeholder pattern used elsewhere (artist-profiles-transform). */
function toSuggestedArtist(a: CandidateArtist): Artist {
  return {
    id: a.id,
    name: a.name,
    slug: a.slug,
    avatar: a.image || `https://picsum.photos/seed/${a.slug}/400/400`,
    location: a.location || "",
    primaryMedium: a.primary_medium || "",
    url: `${SITE}/browse/${a.slug}`,
  };
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStartLabel = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const weekEndLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const { data: venues } = await db
    .from("venue_profiles")
    .select("user_id, name, slug, created_at, email_digest_enabled")
    .not("user_id", "is", null)
    .lte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

  // Computed once for the whole run, not per venue: every venue in this
  // week's digest sees the same ranked list. Does not exclude artists
  // already placed at the venue receiving the email (keep it simple for a
  // first cut; a follow-up could tailor per venue).
  const { data: artistRows } = await db
    .from("artist_profiles")
    .select("id, slug, name, profile_image, review_status, subscription_status, subscription_plan, created_at, primary_medium, location");
  const suggestedArtists = rankArtistsForVenueDigest(
    (artistRows || []).map((row) => toCandidateArtist(row as ArtistProfileRow)),
  ).map(toSuggestedArtist);

  const result = await runBatch(venues || [], async (venue) => {
    if (!venue.user_id) return;
    // The portal's "Weekly digest" switch writes venue_profiles.email_digest_enabled
    // (PATCH /api/account/preferences), and until now nothing read it: the only
    // gate was email_preferences.digests_enabled, checked inside sendEmail, so the
    // switch a venue could actually see did nothing. Both are honoured: this one
    // here, the other in the pipeline. Either off means no digest. NULL (the
    // column's default before anyone touches the switch) means on.
    if (venue.email_digest_enabled === false) return;

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
        // on every send, with no source behind either one. The stat stays gone,
        // nothing here counts "matches". `suggestedArtists` is now real:
        // approved artists on an active or trialing subscription, ranked Pro
        // first, then Premium, then everyone else, newest first within a tier
        // (rankArtistsForVenueDigest), passed only when the list is non-empty.
        ...(suggestedArtists.length > 0 ? { suggestedArtists } : {}),
        dashboardUrl: `${SITE}/venue-portal`,
      }),
      metadata: { week: weekStartLabel },
    });
  });

  // WS6.5: all-failed runs 500 and alert admin; partial failure stays 200.
  return finishCronRun("weekly-venue-digest", result, { ...result });
}
