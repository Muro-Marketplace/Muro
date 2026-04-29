// Vercel Cron, daily 09:00 UTC. Aggregates yesterday's qr_scan
// analytics_events by artist_slug and sends each artist who actually
// got scans a digest. Quiet days produce no email.
//
// Wired in vercel.json so Vercel hits it once a day; the route also
// runs locally via:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/qr-scan-digest

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { ArtistQrScanDigest } from "@/emails/templates/performance/ArtistQrScanDigest";
import { requireCronAuth } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

interface ScanRow {
  artist_slug: string | null;
  work_id: string | null;
  venue_name: string | null;
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();

  // Day window: yesterday 00:00 UTC → today 00:00 UTC.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  );
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayLabel = yesterdayUtc.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Pull all qr_scan events from the window. analytics_events is
  // append-only, so this is safe to scan-and-aggregate in app code
  // for now; if scan volume grows we'd switch to a SQL view.
  const { data, error } = await db
    .from("analytics_events")
    .select("artist_slug, work_id, venue_name")
    .eq("event_type", "qr_scan")
    .gte("created_at", yesterdayUtc.toISOString())
    .lt("created_at", todayUtc.toISOString());
  if (error) {
    console.error("[qr-digest] scan query failed:", error.message);
    return NextResponse.json({ error: "Scan query failed" }, { status: 500 });
  }

  const rows = (data || []) as ScanRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_scans" });
  }

  // Aggregate by artist_slug → list of {workTitle, venueName, scans}.
  const byArtist = new Map<
    string,
    Map<string, { workTitle: string; venueName: string | null; scans: number; image?: string | null }>
  >();
  // We also need work titles + images, which the events table doesn't
  // carry, pull artist_works once we have the unique IDs.
  const allWorkIds = new Set<string>();
  for (const r of rows) {
    if (!r.artist_slug) continue;
    if (r.work_id) allWorkIds.add(r.work_id);
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

  for (const r of rows) {
    if (!r.artist_slug) continue;
    let perArtist = byArtist.get(r.artist_slug);
    if (!perArtist) {
      perArtist = new Map();
      byArtist.set(r.artist_slug, perArtist);
    }
    // Group within an artist by work_id + venue (so the same work at
    // different venues lists separately). Fallback bucket = "portfolio
    // scan" when work_id is missing.
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

  let sent = 0;
  let skipped = 0;
  for (const [artistSlug, worksMap] of byArtist.entries()) {
    try {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name, slug")
        .eq("slug", artistSlug)
        .single<{ user_id: string | null; name: string; slug: string }>();
      if (!profile?.user_id) {
        skipped += 1;
        continue;
      }
      const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
      if (!user?.email) {
        skipped += 1;
        continue;
      }

      const works = Array.from(worksMap.values()).sort((a, b) => b.scans - a.scans);
      const totalScans = works.reduce((acc, w) => acc + w.scans, 0);

      // In-app bell: low priority but consistent with the other
      // performance signals. Single notification per digest day.
      createNotification({
        userId: profile.user_id,
        kind: "qr_scan_digest",
        title: totalScans === 1 ? "1 QR scan yesterday" : `${totalScans} QR scans yesterday`,
        body: works[0]
          ? `Top: ${works[0].workTitle}${works[0].venueName ? ` at ${works[0].venueName}` : ""}`
          : "",
        link: "/artist-portal/analytics",
      }).catch((err) => console.warn("[qr-digest] notification failed:", err));

      await sendEmail({
        // Day-bucketed idempotency so accidental double-runs don't
        // double-send.
        idempotencyKey: `qr_scan_digest:${profile.user_id}:${yesterdayUtc.toISOString().slice(0, 10)}`,
        template: "artist_qr_scan_digest",
        category: "digests",
        to: user.email,
        subject:
          totalScans === 1
            ? `1 QR scan yesterday`
            : `${totalScans} QR scans yesterday`,
        userId: profile.user_id,
        react: ArtistQrScanDigest({
          firstName: (profile.name || "there").split(" ")[0],
          dayLabel: yesterdayLabel,
          totalScans,
          works,
          analyticsUrl: `${SITE}/artist-portal/analytics`,
        }),
        metadata: { day: yesterdayUtc.toISOString().slice(0, 10), totalScans },
      });
      sent += 1;
    } catch (err) {
      console.error(
        "[qr-digest] failed to digest artist",
        artistSlug,
        err,
      );
      skipped += 1;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, day: yesterdayUtc.toISOString().slice(0, 10) });
}
