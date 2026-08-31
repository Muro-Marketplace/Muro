// Vercel Cron, daily 10:00 UTC. Finds users inactive for 14 / 30 / 90 days
// across all three personas and sends the matching re-engagement email.
//
// "Inactive" = no sign-in activity in the window. We read `last_sign_in_at`
// from Supabase auth.users for each profile. Users who have been emailed
// via this job in the last 14 days (any inactive_* template) are skipped,
// avoids cascading re-engagement waves.

// H22/H26. Every figure this job put in front of a returning user used to be a
// literal: `profileViews: 0`, `portfolioStats` of two zeros, `suggestedArtists:
// []`, `recommendedWorks: []`. So the 14-day artist email told an artist nobody
// had looked at their profile while they were away, whatever the truth, and the
// venue and customer emails promised a list and shipped none.
//
// The rule now: every number is counted from the database at send time, and a
// list we cannot fill means the email does not go, rather than an email that
// says "here are some artists" over empty space.
//
// H26 also mailed STAFF as customers. The customer branch is a fallback for
// "user with no artist and no venue profile", which is exactly what an admin
// account looks like, so admins got "Still enjoy the gallery?". Admins are now
// excluded from the whole sweep, off the ADMIN_EMAILS allowlist that
// lib/admin-auth owns, never off user metadata. Both halves of that predicate
// are covered: the allowlist AND an admin_users row, via adminUserIdsAmong.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { adminUserIdsAmong } from "@/lib/admin-auth";
import { slugify } from "@/lib/slugify";
import type { Artist, Work } from "@/emails/types/emailTypes";
import { ArtistInactive14d } from "@/emails/templates/re-engagement/ArtistInactive14d";
import { ArtistInactive30d } from "@/emails/templates/re-engagement/ArtistInactive30d";
import { ArtistInactive90d } from "@/emails/templates/re-engagement/ArtistInactive90d";
import { VenueInactive30d } from "@/emails/templates/re-engagement/VenueInactive30d";
import { VenueInactive90dWhiteGlove } from "@/emails/templates/re-engagement/VenueInactive90dWhiteGlove";
import { CustomerInactive30d } from "@/emails/templates/re-engagement/CustomerInactive30d";
import { CustomerInactive90d } from "@/emails/templates/re-engagement/CustomerInactive90d";
import { requireCronAuth, runBatch, finishCronRun } from "../_auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/** "New since you were away" means the 30 days the 30-day emails cover. */
const RECENT_WINDOW_DAYS = 30;
const MAX_SUGGESTED_ARTISTS = 4;
const MAX_RECOMMENDED_WORKS = 4;

// R6.F15: listUsers is paged. The old single `perPage: 1000` call silently
// exempted user 1001+ from every re-engagement email (its own comment admitted
// "paginate in a real deploy"). Pages are processed one at a time so the
// profile IN() joins stay bounded to a page of ids.
const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 30;

type Tier = 14 | 30 | 90;
function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function tierFor(days: number): Tier | null {
  if (days >= 88 && days <= 92) return 90;
  if (days >= 28 && days <= 32) return 30;
  if (days >= 13 && days <= 15) return 14;
  return null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Count analytics events of one type for one artist over a window.
 *
 * Zero-on-error is deliberate and safe HERE, unlike in a dashboard total: a
 * failed count only ever understates the stat block, and the log says so.
 */
async function eventCount(
  db: SupabaseClient,
  eventType: string,
  artistSlug: string,
  since: string,
): Promise<number> {
  const { count, error } = await db
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .eq("artist_slug", artistSlug)
    .gte("created_at", since);
  if (error) {
    console.error(`[inactive-users] ${eventType} count failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Artists who joined in the last RECENT_WINDOW_DAYS, as the venue email's
 * `Artist` cards.
 *
 * Only approved profiles, so the email never surfaces an un-reviewed portfolio,
 * and only profiles with the three fields the card actually renders (avatar,
 * medium, location). A row missing any of them would render a broken image or a
 * dangling "Painting · " and there is no honest placeholder for it.
 *
 * Note what this is NOT: proximity. There is no geo matching, so the template no
 * longer claims any, and this is ordered by recency alone.
 */
async function recentArtists(db: SupabaseClient): Promise<Artist[]> {
  const { data, error } = await db
    .from("artist_profiles")
    .select("id, name, slug, profile_image, location, primary_medium, created_at")
    .eq("review_status", "approved")
    .gte("created_at", daysAgoIso(RECENT_WINDOW_DAYS))
    .order("created_at", { ascending: false })
    .limit(MAX_SUGGESTED_ARTISTS * 4);
  if (error) {
    console.error("[inactive-users] recent artists query failed:", error.message);
    return [];
  }
  type Row = {
    id: string; name: string | null; slug: string | null;
    profile_image: string | null; location: string | null; primary_medium: string | null;
  };
  return ((data || []) as Row[])
    .flatMap((a) => {
      if (!a.slug || !a.name || !a.profile_image || !a.location || !a.primary_medium) return [];
      return [{
        id: a.id,
        name: a.name,
        slug: a.slug,
        avatar: a.profile_image,
        location: a.location,
        primaryMedium: a.primary_medium,
        url: `${SITE}/browse/${a.slug}`,
      }];
    })
    .slice(0, MAX_SUGGESTED_ARTISTS);
}

/**
 * Works listed in the last RECENT_WINDOW_DAYS and still available, as the
 * customer email's `Work` cards.
 *
 * The artist join is a second round-trip on purpose (Supabase REST joins need
 * the FK registered) and is filtered to approved artists, so a pending
 * applicant's portfolio cannot leak into a public-facing email through a
 * recommendation.
 */
async function recentWorks(db: SupabaseClient): Promise<Work[]> {
  const { data, error } = await db
    .from("artist_works")
    .select("id, title, image, artist_id, price_band, dimensions, created_at")
    .eq("available", true)
    .gte("created_at", daysAgoIso(RECENT_WINDOW_DAYS))
    .order("created_at", { ascending: false })
    .limit(MAX_RECOMMENDED_WORKS * 6);
  if (error) {
    console.error("[inactive-users] recent works query failed:", error.message);
    return [];
  }
  type WorkRow = {
    id: string; title: string | null; image: string | null; artist_id: string;
    price_band: string | null; dimensions: string | null;
  };
  const rows = (data || []) as WorkRow[];
  if (rows.length === 0) return [];

  const artistIds = Array.from(new Set(rows.map((w) => w.artist_id).filter(Boolean)));
  const { data: artists } = await db
    .from("artist_profiles")
    .select("id, name, slug")
    .in("id", artistIds)
    .eq("review_status", "approved");
  const artistById = new Map(
    ((artists || []) as Array<{ id: string; name: string | null; slug: string | null }>).map((a) => [a.id, a]),
  );

  const out: Work[] = [];
  for (const w of rows) {
    if (out.length >= MAX_RECOMMENDED_WORKS) break;
    const a = artistById.get(w.artist_id);
    if (!a?.name || !a.slug || !w.title || !w.image) continue;
    out.push({
      id: w.id,
      title: w.title,
      artistName: a.name,
      artistSlug: a.slug,
      image: w.image,
      url: `${SITE}/browse/${a.slug}/${slugify(w.title)}`,
      priceLabel: w.price_band || undefined,
      size: w.dimensions || undefined,
    });
  }
  return out;
}

async function sentRecentlyForUser(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  templatePrefix: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("email_events")
    .select("id")
    .eq("user_id", userId)
    .like("template", `${templatePrefix}_inactive_%`)
    .gte("created_at", since)
    .in("status", ["sent", "queued"])
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const totals = { succeeded: 0, failed: 0 };
  let usersSeen = 0;
  let adminsSkipped = 0;

  // The venue and customer lists are the same for everyone this run, so they're
  // fetched at most once and only if some user actually reaches that branch.
  // Held in the request scope, not module scope: a warm lambda would otherwise
  // serve yesterday's "new this month" list.
  let artistSuggestions: Artist[] | undefined;
  const suggestedArtists = async () => (artistSuggestions ??= await recentArtists(db));
  let workSuggestions: Work[] | undefined;
  const recommendedWorks = async () => (workSuggestions ??= await recentWorks(db));

  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data: pageData, error: listError } = await db.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (listError) {
      // Without the user list nothing downstream can run, so this is a
      // job-level fault, not a bad row: surface it as a 500 (with whatever
      // was processed before it) so Vercel's cron monitor sees the run.
      console.error("[inactive-users] listUsers failed on page", page, listError);
      return NextResponse.json(
        { error: "Could not list users", page, ...totals, users: usersSeen },
        { status: 500 },
      );
    }
    const users = pageData?.users || [];
    if (users.length === 0) break;
    usersSeen += users.length;

    // Join this page to profiles so we know which persona each user is.
    const userIds = users.map((u) => u.id);
    const [{ data: artists }, { data: venues }] = await Promise.all([
      db.from("artist_profiles").select("user_id, name, slug").in("user_id", userIds),
      db.from("venue_profiles").select("user_id, name, slug").in("user_id", userIds),
    ]);
    const admins = await adminUserIdsAmong(users);

    const artistByUid = new Map((artists || []).map((a) => [a.user_id, a]));
    const venueByUid = new Map((venues || []).map((v) => [v.user_id, v]));

    const result = await runBatch(users, async (user) => {
      const days = daysSince(user.last_sign_in_at);
      const tier = tierFor(days);
      if (!tier) return;
      if (!user.email) return;
      // H26: staff accounts have no artist and no venue profile, so they fell
      // through to the customer branch and were sent "Still enjoy the gallery?".
      if (admins.has(user.id)) {
        adminsSkipped += 1;
        return;
      }

      const firstName = user.user_metadata?.first_name || "there";
      const artist = artistByUid.get(user.id);
      const venue = venueByUid.get(user.id);

      // Artist
      if (artist) {
        if (await sentRecentlyForUser(db, user.id, "artist")) return;
        const key = `artist_inactive_${tier}d:${user.id}:${new Date().toISOString().slice(0, 10)}`;
        if (tier === 14) {
          // Real 14-day count. `nearbyVenues` is not passed at all: there is no
          // geo matching, and the template drops the stat rather than saying 0.
          const profileViews = await eventCount(db, "profile_view", artist.slug, daysAgoIso(14));
          await sendEmail({
            idempotencyKey: key,
            template: "artist_inactive_14d",
            category: "tips",
            to: user.email,
            subject: `We missed you, a look at your quiet fortnight`,
            userId: user.id,
            react: ArtistInactive14d({ firstName, profileViews, dashboardUrl: `${SITE}/artist-portal` }),
            metadata: { tier, days, profileViews },
          });
        } else if (tier === 30) {
          const since = daysAgoIso(30);
          const [profileViews, qrScans] = await Promise.all([
            eventCount(db, "profile_view", artist.slug, since),
            eventCount(db, "qr_scan", artist.slug, since),
          ]);
          await sendEmail({
            idempotencyKey: key,
            template: "artist_inactive_30d",
            category: "tips",
            to: user.email,
            subject: `A month in, your portfolio snapshot`,
            userId: user.id,
            react: ArtistInactive30d({
              firstName,
              portfolioStats: [
                { label: "Profile views", value: profileViews },
                { label: "QR scans", value: qrScans },
              ],
              suggestedAction: "Add one new piece, artists with 5+ works appear higher in venue searches.",
              dashboardUrl: `${SITE}/artist-portal`,
            }),
            metadata: { tier, days, profileViews, qrScans },
          });
        } else if (tier === 90) {
          await sendEmail({
            idempotencyKey: key,
            template: "artist_inactive_90d",
            category: "tips",
            to: user.email,
            subject: `We're keeping a spot for you`,
            userId: user.id,
            react: ArtistInactive90d({
              firstName,
              returnUrl: `${SITE}/artist-portal`,
              preferenceUrl: `${SITE}/account/email`,
            }),
            metadata: { tier, days },
          });
        }
        return;
      }

      // Venue
      if (venue) {
        if (await sentRecentlyForUser(db, user.id, "venue")) return;
        const key = `venue_inactive_${tier}d:${user.id}:${new Date().toISOString().slice(0, 10)}`;
        if (tier === 30) {
          // The whole email is the list. No artists joined in the window means
          // there is nothing true to say, so nothing is sent. The subject drops
          // "near", which nothing here can establish.
          const artistsToSuggest = await suggestedArtists();
          if (artistsToSuggest.length === 0) return;
          await sendEmail({
            idempotencyKey: key,
            template: "venue_inactive_30d",
            category: "tips",
            to: user.email,
            subject: `New artists for ${venue.name}`,
            userId: user.id,
            react: VenueInactive30d({
              firstName,
              venueName: venue.name,
              suggestedArtists: artistsToSuggest,
              browseArtistsUrl: `${SITE}/browse`,
            }),
            metadata: { tier, days, suggestedArtists: artistsToSuggest.length },
          });
        } else if (tier === 90) {
          await sendEmail({
            idempotencyKey: key,
            template: "venue_inactive_90d_white_glove",
            category: "tips",
            to: user.email,
            subject: `Can we help at ${venue.name}?`,
            userId: user.id,
            react: VenueInactive90dWhiteGlove({
              firstName,
              venueName: venue.name,
              // R6.F12: /venue-portal/curation does not exist and never did;
              // /curated is the real curation entry point (the venue-portal
              // dashboard's own "Explore Curated" card links there too).
              curationRequestUrl: `${SITE}/curated`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { tier, days },
          });
        }
        return;
      }

      // Customer fallback, user exists, no profile.
      if (await sentRecentlyForUser(db, user.id, "customer")) return;
      const key = `customer_inactive_${tier}d:${user.id}:${new Date().toISOString().slice(0, 10)}`;
      if (tier === 30) {
        // Same rule as the venue 30-day email: the body is the curation, so no
        // new work means no email rather than "a small curation" of nothing.
        const works = await recommendedWorks();
        if (works.length === 0) return;
        await sendEmail({
          idempotencyKey: key,
          template: "customer_inactive_30d",
          category: "tips",
          to: user.email,
          subject: "New pieces worth seeing",
          userId: user.id,
          react: CustomerInactive30d({ firstName, recommendedWorks: works, browseUrl: `${SITE}/browse` }),
          metadata: { tier, days, recommendedWorks: works.length },
        });
      } else if (tier === 90) {
        await sendEmail({
          idempotencyKey: key,
          template: "customer_inactive_90d",
          category: "tips",
          to: user.email,
          subject: "Still enjoy the gallery?",
          userId: user.id,
          react: CustomerInactive90d({ firstName, preferenceUrl: `${SITE}/account/email`, browseUrl: `${SITE}/browse` }),
          metadata: { tier, days },
        });
      }
    });

    totals.succeeded += result.succeeded;
    totals.failed += result.failed;

    if (users.length < USERS_PER_PAGE) break;
  }

  // WS6.5: an all-failed run 500s and alerts admin; partial failure stays 200.
  return finishCronRun("inactive-users", totals, { ...totals, users: usersSeen, adminsSkipped });
}
