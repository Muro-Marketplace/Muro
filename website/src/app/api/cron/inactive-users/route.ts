// Vercel Cron, daily 10:00 UTC. Finds users inactive for 14 / 30 / 90 days
// across all three personas and sends the matching re-engagement email.
//
// "Inactive" = no sign-in activity in the window. We read `last_sign_in_at`
// from Supabase auth.users for each profile. Users who have been emailed
// via this job in the last 14 days (any inactive_* template) are skipped,
// avoids cascading re-engagement waves.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { ArtistInactive14d } from "@/emails/templates/re-engagement/ArtistInactive14d";
import { ArtistInactive30d } from "@/emails/templates/re-engagement/ArtistInactive30d";
import { ArtistInactive90d } from "@/emails/templates/re-engagement/ArtistInactive90d";
import { VenueInactive30d } from "@/emails/templates/re-engagement/VenueInactive30d";
import { VenueInactive90dWhiteGlove } from "@/emails/templates/re-engagement/VenueInactive90dWhiteGlove";
import { CustomerInactive30d } from "@/emails/templates/re-engagement/CustomerInactive30d";
import { CustomerInactive90d } from "@/emails/templates/re-engagement/CustomerInactive90d";
import { requireCronAuth, runBatch, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

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

    const artistByUid = new Map((artists || []).map((a) => [a.user_id, a]));
    const venueByUid = new Map((venues || []).map((v) => [v.user_id, v]));

    const result = await runBatch(users, async (user) => {
      const days = daysSince(user.last_sign_in_at);
      const tier = tierFor(days);
      if (!tier) return;
      if (!user.email) return;

      const firstName = user.user_metadata?.first_name || "there";
      const artist = artistByUid.get(user.id);
      const venue = venueByUid.get(user.id);

      // Artist
      if (artist) {
        if (await sentRecentlyForUser(db, user.id, "artist")) return;
        const key = `artist_inactive_${tier}d:${user.id}:${new Date().toISOString().slice(0, 10)}`;
        if (tier === 14) {
          await sendEmail({
            idempotencyKey: key,
            template: "artist_inactive_14d",
            category: "tips",
            to: user.email,
            subject: `We missed you, a look at your quiet fortnight`,
            userId: user.id,
            react: ArtistInactive14d({ firstName, profileViews: 0, nearbyVenues: [], dashboardUrl: `${SITE}/artist-portal` }),
            metadata: { tier, days },
          });
        } else if (tier === 30) {
          await sendEmail({
            idempotencyKey: key,
            template: "artist_inactive_30d",
            category: "tips",
            to: user.email,
            subject: `A month in, your portfolio snapshot`,
            userId: user.id,
            react: ArtistInactive30d({
              firstName,
              portfolioStats: [{ label: "Profile views", value: 0 }, { label: "QR scans", value: 0 }],
              suggestedAction: "Add one new piece, artists with 5+ works appear higher in venue searches.",
              dashboardUrl: `${SITE}/artist-portal`,
            }),
            metadata: { tier, days },
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
          await sendEmail({
            idempotencyKey: key,
            template: "venue_inactive_30d",
            category: "tips",
            to: user.email,
            subject: `New artists near ${venue.name}`,
            userId: user.id,
            react: VenueInactive30d({
              firstName,
              venueName: venue.name,
              suggestedArtists: [],
              browseArtistsUrl: `${SITE}/browse`,
            }),
            metadata: { tier, days },
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
        await sendEmail({
          idempotencyKey: key,
          template: "customer_inactive_30d",
          category: "tips",
          to: user.email,
          subject: "New pieces worth seeing",
          userId: user.id,
          react: CustomerInactive30d({ firstName, recommendedWorks: [], browseUrl: `${SITE}/browse` }),
          metadata: { tier, days },
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
  return finishCronRun("inactive-users", totals, { ...totals, users: usersSeen });
}
