// Vercel Cron, daily 09:00 UTC. Aggregates recent qr_scan analytics_events
// by artist_slug and day, and sends each artist who actually got scans one
// digest per scanned day. Quiet days produce no email.
//
// R6.F14: the window covers the last LOOKBACK_DAYS UTC days rather than
// yesterday only, so a missed or failed daily run no longer permanently drops
// that day's digests: the next successful run catches the backlog, and the
// day-bucketed idempotency keys (email AND bell) make already-covered days
// no-ops rather than duplicates.
//
// Wired in vercel.json so Vercel hits it once a day; the route also
// runs locally via:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/qr-scan-digest

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { ArtistQrScanDigest } from "@/emails/templates/performance/ArtistQrScanDigest";
import { requireCronAuth, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// How many whole UTC days back the digest reaches. 3 tolerates two
// consecutive missed runs; the once-per-day keys absorb the overlap.
const LOOKBACK_DAYS = 3;

interface ScanRow {
  artist_slug: string | null;
  work_id: string | null;
  venue_name: string | null;
  created_at: string;
}

type WorkAgg = { workTitle: string; venueName: string | null; scans: number; image?: string | null };

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();

  // Window: LOOKBACK_DAYS whole UTC days, ending today 00:00 UTC (today's
  // scans wait for tomorrow's run, as before).
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  );
  const windowStart = new Date(todayUtc.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Pull all qr_scan events from the window. analytics_events is
  // append-only, so this is safe to scan-and-aggregate in app code
  // for now; if scan volume grows we'd switch to a SQL view.
  const { data, error } = await db
    .from("analytics_events")
    .select("artist_slug, work_id, venue_name, created_at")
    .eq("event_type", "qr_scan")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", todayUtc.toISOString());
  if (error) {
    console.error("[qr-digest] scan query failed:", error.message);
    return NextResponse.json({ error: "Scan query failed" }, { status: 500 });
  }

  const rows = (data || []) as ScanRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_scans" });
  }

  // Work titles + images, which the events table doesn't carry; pull
  // artist_works once for every id seen anywhere in the window.
  const allWorkIds = new Set<string>();
  for (const r of rows) {
    if (r.artist_slug && r.work_id) allWorkIds.add(r.work_id);
  }
  const workMeta: Record<string, { title: string; image?: string | null }> = {};
  if (allWorkIds.size > 0) {
    const { data: works } = await db
      .from("artist_works")
      .select("id, title, image")
      .in("id", Array.from(allWorkIds));
    for (const w of (works || []) as Array<{ id: string; title: string; image?: string | null }>) {
      workMeta[w.id] = { title: w.title, image: w.image };
    }
  }

  // Bucket by UTC day, then by artist. Within an artist a group is
  // work_id + venue (so the same work at different venues lists
  // separately); fallback bucket = "portfolio scan" when work_id is
  // missing.
  const byDay = new Map<string, Map<string, Map<string, WorkAgg>>>();
  for (const r of rows) {
    if (!r.artist_slug) continue;
    const dayKey = new Date(r.created_at).toISOString().slice(0, 10);
    let byArtist = byDay.get(dayKey);
    if (!byArtist) {
      byArtist = new Map();
      byDay.set(dayKey, byArtist);
    }
    let perArtist = byArtist.get(r.artist_slug);
    if (!perArtist) {
      perArtist = new Map();
      byArtist.set(r.artist_slug, perArtist);
    }
    const groupKey = `${r.work_id || "_portfolio"}|${r.venue_name || "_no_venue"}`;
    const meta = r.work_id ? workMeta[r.work_id] : null;
    const existing = perArtist.get(groupKey);
    if (existing) {
      existing.scans += 1;
    } else {
      perArtist.set(groupKey, {
        workTitle: meta?.title || (r.work_id ? "Untitled work" : "Portfolio scan"),
        venueName: r.venue_name,
        scans: 1,
        image: meta?.image,
      });
    }
  }

  // The same artist can appear on several days; look their account up once.
  const artistCache = new Map<string, { userId: string; name: string; email: string } | null>();
  async function resolveArtist(artistSlug: string) {
    if (artistCache.has(artistSlug)) return artistCache.get(artistSlug) ?? null;
    const { data: profile } = await db
      .from("artist_profiles")
      .select("user_id, name, slug")
      .eq("slug", artistSlug)
      .single<{ user_id: string | null; name: string; slug: string }>();
    if (!profile?.user_id) {
      artistCache.set(artistSlug, null);
      return null;
    }
    const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
    if (!user?.email) {
      artistCache.set(artistSlug, null);
      return null;
    }
    const resolved = { userId: profile.user_id, name: profile.name, email: user.email };
    artistCache.set(artistSlug, resolved);
    return resolved;
  }

  let sent = 0;
  let deduped = 0;
  let skipped = 0;
  let failed = 0;

  const dayKeys = Array.from(byDay.keys()).sort();
  for (const dayKey of dayKeys) {
    const dayLabel = new Date(`${dayKey}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const byArtist = byDay.get(dayKey)!;
    for (const [artistSlug, worksMap] of byArtist.entries()) {
      try {
        const artist = await resolveArtist(artistSlug);
        if (!artist) {
          skipped += 1;
          continue;
        }

        const works = Array.from(worksMap.values()).sort((a, b) => b.scans - a.scans);
        const totalScans = works.reduce((acc, w) => acc + w.scans, 0);
        const scansHeadline = totalScans === 1 ? "1 QR scan" : `${totalScans} QR scans`;
        const isYesterday = dayKey === new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const whenLabel = isYesterday ? "yesterday" : `on ${dayLabel}`;

        // In-app bell: low priority but consistent with the other
        // performance signals. Day-bucketed idempotency key (R6.F6c),
        // matching the email's: a same-day re-run or a catch-up over an
        // already-covered day no longer double-bells while the emails
        // dedupe.
        createNotification({
          userId: artist.userId,
          kind: "qr_scan_digest",
          title: `${scansHeadline} ${whenLabel}`,
          body: works[0]
            ? `Top: ${works[0].workTitle}${works[0].venueName ? ` at ${works[0].venueName}` : ""}`
            : "",
          link: "/artist-portal/analytics",
          idempotencyKey: `qr_scan_digest:${artist.userId}:${dayKey}`,
        }).catch((err) => console.warn("[qr-digest] notification failed:", err));

        const emailResult = await sendEmail({
          // Day-bucketed idempotency so accidental double-runs and the
          // catch-up window don't double-send.
          idempotencyKey: `qr_scan_digest:${artist.userId}:${dayKey}`,
          template: "artist_qr_scan_digest",
          category: "digests",
          to: artist.email,
          subject: `${scansHeadline} ${whenLabel}`,
          userId: artist.userId,
          react: ArtistQrScanDigest({
            firstName: (artist.name || "there").split(" ")[0],
            dayLabel,
            totalScans,
            works,
            analyticsUrl: `${SITE}/artist-portal/analytics`,
          }),
          metadata: { day: dayKey, totalScans },
        });
        if (!emailResult.ok) {
          failed += 1;
          console.error("[qr-digest] email send failed for", artistSlug, dayKey, emailResult.error);
        } else if (emailResult.skipped) {
          if (emailResult.reason === "duplicate") deduped += 1;
          else skipped += 1;
        } else {
          sent += 1;
        }
      } catch (err) {
        console.error("[qr-digest] failed to digest artist", artistSlug, "for", dayKey, err);
        failed += 1;
      }
    }
  }

  // WS6.5: every-item-failed runs 500 and alert admin; benign skips and
  // dedups count as processed, not failed.
  return finishCronRun(
    "qr-scan-digest",
    { succeeded: sent + deduped + skipped, failed },
    { sent, deduped, skipped, failed, days: dayKeys },
  );
}
