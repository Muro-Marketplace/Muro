// Vercel Cron, Tuesday 09:00 UTC. Walks active artists, computes their
// week's activity, and sends the polished weekly digest.
// Skips any artist with <3 notable events (no "you had a quiet week" emails).
//
// H23. Two numbers in this email used to be made up:
//
//   1. `topWorks` was always `[]`, so "Top works this week" printed a heading
//      with nothing under it in every digest ever sent. It is now aggregated
//      from the week's qr_scan events, and the section only renders when there
//      is something real to put in it.
//   2. the "Messages" stat counted `is_read = false` AT SEND TIME, so a message
//      the artist had already opened vanished from their own weekly summary,
//      and, worse, out of the 3-event gate that decides whether the digest is
//      worth sending at all. The stat now counts messages RECEIVED in the week.
//      The unread count still exists, but only where it is true: the "reply to
//      N unread" suggestion.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { slugify } from "@/lib/slugify";
import { ArtistWeeklyPortfolioDigest } from "@/emails/templates/performance/ArtistWeeklyPortfolioDigest";
import type { Work } from "@/emails/types/emailTypes";
import { requireCronAuth, runBatch, finishCronRun } from "../_auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/** How many works the digest's "Top works" section shows. */
const TOP_WORKS = 3;

/**
 * The artist's most-scanned works for the week, as the template's `Work` shape.
 *
 * Aggregated the same way `cron/qr-scan-digest` does it: bucket qr_scan events
 * by `work_id`, then resolve the ids against `artist_works` for the title and
 * image the card needs. Two kinds of row drop out on purpose:
 *
 *   - an id that resolves to nothing. QR labels printed before the `w=` param
 *     existed put the work TITLE in `work_id`, so those never match a row. A
 *     card reading "Untitled work" is worse than no card.
 *   - a work with no image, because the card is image-led and a broken <img>
 *     in an inbox looks like a broken email. Its scans still count in the
 *     "QR scans" stat, which is where the number belongs.
 *
 * Returns [] when nothing survives, and the template then omits the section
 * rather than printing an empty heading.
 */
async function topScannedWorks(
  db: SupabaseClient,
  artist: { slug: string; name: string | null },
  since: string,
): Promise<Work[]> {
  const { data: scans, error } = await db
    .from("analytics_events")
    .select("work_id")
    .eq("event_type", "qr_scan")
    .eq("artist_slug", artist.slug)
    .gte("created_at", since)
    .not("work_id", "is", null);
  if (error) {
    console.error("[weekly-artist-digest] top works query failed:", error.message);
    return [];
  }

  const scansByWorkId = new Map<string, number>();
  for (const row of (scans || []) as Array<{ work_id: string | null }>) {
    if (!row.work_id) continue;
    scansByWorkId.set(row.work_id, (scansByWorkId.get(row.work_id) || 0) + 1);
  }
  const ranked = Array.from(scansByWorkId.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_WORKS);
  if (ranked.length === 0) return [];

  const { data: works } = await db
    .from("artist_works")
    .select("id, title, image")
    .in("id", ranked.map(([id]) => id));
  const byId = new Map(
    ((works || []) as Array<{ id: string; title: string | null; image: string | null }>).map((w) => [w.id, w]),
  );

  const artistName = artist.name || "";
  return ranked.flatMap(([id]) => {
    const w = byId.get(id);
    if (!w?.title || !w.image) return [];
    return [{
      id: w.id,
      title: w.title,
      artistName,
      artistSlug: artist.slug,
      image: w.image,
      url: `${SITE}/browse/${artist.slug}/${slugify(w.title)}`,
    }];
  });
}

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
    // `messageCount` is every message RECEIVED in the week; `unreadCount` is
    // the subset still unread when the digest runs. Only the second one is
    // allowed to be described as unread (H23).
    const [
      { count: viewCount },
      { count: scanCount },
      { count: messageCount },
      { count: unreadCount },
      { count: placementCount },
    ] = await Promise.all([
      db.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event_type", "profile_view").eq("artist_slug", artist.slug).gte("created_at", weekAgo),
      db.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event_type", "qr_scan").eq("artist_slug", artist.slug).gte("created_at", weekAgo),
      db.from("messages").select("id", { count: "exact", head: true })
        .eq("recipient_user_id", artist.user_id).gte("created_at", weekAgo),
      db.from("messages").select("id", { count: "exact", head: true })
        .eq("recipient_user_id", artist.user_id).eq("is_read", false).gte("created_at", weekAgo),
      db.from("placements").select("id", { count: "exact", head: true })
        .eq("artist_user_id", artist.user_id).eq("status", "pending").gte("created_at", weekAgo),
    ]);

    const totalEvents = (viewCount ?? 0) + (scanCount ?? 0) + (messageCount ?? 0) + (placementCount ?? 0);
    if (totalEvents < 3) return; // empty week, skip

    const { data: { user } } = await db.auth.admin.getUserById(artist.user_id);
    if (!user?.email) return;

    // Only worth a query when something was actually scanned this week.
    const topWorks = (scanCount ?? 0) > 0
      ? await topScannedWorks(db, { slug: artist.slug, name: artist.name }, weekAgo)
      : [];
    const unread = unreadCount ?? 0;

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
        topWorks,
        recommendedActions: [
          unread > 0
            ? `Reply to ${unread} unread message${unread === 1 ? "" : "s"}`
            : "Add one new piece, artists with 5+ works rank higher",
          "Refresh your profile photo, venues scan profiles in seconds",
        ],
        dashboardUrl: `${SITE}/artist-portal`,
      }),
      metadata: { week: weekStartLabel },
    });
  });

  // WS6.5: all-failed runs 500 and alert admin; partial failure stays 200.
  return finishCronRun("weekly-artist-digest", result, { ...result });
}
