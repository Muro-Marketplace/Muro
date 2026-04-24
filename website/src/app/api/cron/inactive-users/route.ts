// Vercel Cron — daily 10:00 UTC. Finds users inactive for 14 / 30 / 90 days
// across all three personas and sends the matching re-engagement email.
//
// "Inactive" = no sign-in activity in the window. We read `last_sign_in_at`
// from Supabase auth.users for each profile. Users who have been emailed
// via this job in the last 14 days (any inactive_* template) are skipped —
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
import { requireCronAuth, runBatch } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

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

  // Fetch Supabase auth users (paginate in a real deploy; 1k is fine for MVP).
  const { data: allUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
  const users = allUsers?.users || [];

  // Join to profiles so we know which persona this user is.
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
          subject: `We missed you — a look at your quiet fortnight`,
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
          subject: `A month in — your portfolio snapshot`,
          userId: user.id,
          react: ArtistInactive30d({
            firstName,
            portfolioStats: [{ label: "Profile views", value: 0 }, { label: "QR scans", value: 0 }],
            suggestedAction: "Add one new piece — artists with 5+ works appear higher in venue searches.",
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
            curationRequestUrl: `${SITE}/venue-portal/curation`,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { tier, days },
        });
      }
      return;
    }

    // Customer fallback — user exists, no profile.
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

  return NextResponse.json({ ok: true, ...result });
}
