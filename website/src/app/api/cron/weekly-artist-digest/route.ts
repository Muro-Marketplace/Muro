// Vercel Cron, Tuesday 09:00 UTC. Walks active artists, computes their
// week's activity, and sends the polished weekly digest.
// Skips any artist with <3 notable events (no "you had a quiet week" emails).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { ArtistWeeklyPortfolioDigest } from "@/emails/templates/performance/ArtistWeeklyPortfolioDigest";
import { requireCronAuth, runBatch } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStartLabel = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const weekEndLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  // Artists with an active subscription (or free tier) and a user_id so
  // we have somewhere to email. New signups within the last 14 days skip
  // the digest, they're still in onboarding.
  const { data: artists } = await db
    .from("artist_profiles")
    .select("user_id, name, slug, created_at")
    .not("user_id", "is", null)
    .lte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

  const result = await runBatch(artists || [], async (artist) => {
    if (!artist.user_id) return;

    // Count views, scans, messages, placements from the last 7 days.
    const [{ count: viewCount }, { count: scanCount }, { count: messageCount }, { count: placementCount }] = await Promise.all([
      db.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event_type", "profile_view").eq("artist_slug", artist.slug).gte("created_at", weekAgo),
      db.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event_type", "qr_scan").eq("artist_slug", artist.slug).gte("created_at", weekAgo),
      db.from("messages").select("id", { count: "exact", head: true })
        .eq("recipient_user_id", artist.user_id).eq("is_read", false).gte("created_at", weekAgo),
      db.from("placements").select("id", { count: "exact", head: true })
        .eq("artist_user_id", artist.user_id).eq("status", "pending").gte("created_at", weekAgo),
    ]);

    const totalEvents = (viewCount ?? 0) + (scanCount ?? 0) + (messageCount ?? 0) + (placementCount ?? 0);
    if (totalEvents < 3) return; // empty week, skip

    const { data: { user } } = await db.auth.admin.getUserById(artist.user_id);
    if (!user?.email) return;

    await sendEmail({
      idempotencyKey: `artist_weekly_digest:${artist.user_id}:${weekStartLabel}`,
      template: "artist_weekly_portfolio_digest",
      category: "digests",
      to: user.email,
      subject: `Your week on Wallplace`,
      userId: artist.user_id,
      react: ArtistWeeklyPortfolioDigest({
        firstName: (artist.name || "there").split(" ")[0],
        weekStart: weekStartLabel,
        weekEnd: weekEndLabel,
        profileViews: viewCount ?? 0,
        qrScans: scanCount ?? 0,
        messages: messageCount ?? 0,
        placementRequests: placementCount ?? 0,
        topWorks: [],
        recommendedActions: [
          (messageCount ?? 0) > 0 ? `Reply to ${messageCount} unread message${messageCount === 1 ? "" : "s"}` : "Add one new piece, artists with 5+ works rank higher",
          "Refresh your profile photo, venues scan profiles in seconds",
        ],
        dashboardUrl: `${SITE}/artist-portal`,
      }),
      metadata: { week: weekStartLabel },
    });
  });

  return NextResponse.json({ ok: true, ...result });
}
