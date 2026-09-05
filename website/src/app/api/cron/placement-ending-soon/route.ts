// Vercel Cron, daily 10:00 UTC. Reminds both parties ~14 days before a
// placement's planned end date, so there is time to extend or to arrange
// collection.
//
// HISTORY (EXECUTION-DECISIONS D60 / PROGRESS row 19 #2). This job was gated
// off because it keyed on `placements.end_date`, a column that did not exist:
// PostgREST rejected the select whole on every run, so it had never sent a
// single email while looking healthy on Vercel's dashboard. D60 offered the
// owner (b) build the column and re-enable, or (c) delete the route, the
// vercel.json entry and the template. This is (b): migration 136 adds the
// column, the API and both portals write it, and the real job lives here.
//
// The column is an INTENTION, never an automation. Reaching the date sends
// these reminders and does nothing else; the work is physically on the wall
// until a human confirms collection, so nothing in this file writes `status`.
//
// Local run:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/placement-ending-soon

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { PlacementEndingSoon } from "@/emails/templates/placements/PlacementEndingSoon";
import { ENDING_SOON_NOTICE_DAYS, formatEndDate, plainDateInDays } from "@/lib/placements/end-date";
import { requireCronAuth, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/**
 * How far ahead of the end date the reminder goes out. Re-exported from the
 * shared module so the portal copy that promises "14 days" and the query that
 * delivers it cannot drift apart.
 */
export const NOTICE_DAYS = ENDING_SOON_NOTICE_DAYS;

/**
 * How far back below the 14-day mark the scan still reaches.
 *
 * The leading edge is the 14-day notice; the tail is catch-up, and it exists
 * for the reason R6.F14 records against qr-scan-digest: a window of exactly
 * one day means a single missed or failed run drops that day's cohort
 * permanently, and nobody finds out. Because the idempotency key names the end
 * date, a placement already reminded at 14 days is a no-op at 13 and 12, so
 * the tail costs nothing and only fires for placements the 14-day run missed.
 */
export const CATCHUP_DAYS = 2;

/**
 * Statuses that mean the work is on the wall right now.
 *
 * `completed` is what the collected stage writes, and `cancelled` / `declined`
 * never reached a wall, so none of them should be reminded about collection.
 * `paused` IS included: pausing suspends the arrangement, not the hanging, and
 * a paused piece still has to come down on the agreed day. `sold` is excluded
 * because the piece is already spoken for and "extend or arrange collection"
 * is the wrong question to put to either party.
 */
export const ON_THE_WALL_STATUSES = ["active", "paused"] as const;

interface EndingPlacement {
  id: string;
  artist_user_id: string | null;
  venue_user_id: string | null;
  venue: string | null;
  end_date: string | null;
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();

  // Whole UTC days, so two runs on the same day agree and a placement cannot
  // fall between two windows because of the hour the cron happened to fire.
  const windowEnd = plainDateInDays(NOTICE_DAYS);
  const windowStart = plainDateInDays(NOTICE_DAYS - CATCHUP_DAYS);

  const { data, error } = await db
    .from("placements")
    .select("id, artist_user_id, venue_user_id, venue, end_date")
    .in("status", [...ON_THE_WALL_STATUSES])
    .is("collected_at", null)
    .gte("end_date", windowStart)
    .lte("end_date", windowEnd);

  if (error) {
    console.error("[placement-ending-soon] query failed:", error.message);
    return NextResponse.json({ error: "Placement query failed" }, { status: 500 });
  }

  const placements = (data || []) as EndingPlacement[];
  if (placements.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "no_placements_ending",
      window: { from: windowStart, to: windowEnd },
    });
  }

  let sent = 0;
  let deduped = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of placements) {
    const endDate = p.end_date;
    // Belt and braces: the query filters on end_date, so a null here would
    // mean the filter did not apply, and a reminder with no date in it is
    // worse than none.
    if (!endDate) {
      skipped += 1;
      continue;
    }
    const endDateLabel = formatEndDate(endDate);
    if (!endDateLabel) {
      console.error("[placement-ending-soon] unreadable end_date on", p.id, endDate);
      skipped += 1;
      continue;
    }

    const placementUrl = `${SITE}/placements/${encodeURIComponent(p.id)}`;

    let venueName = p.venue || "the venue";
    if (p.venue_user_id) {
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("name")
        .eq("user_id", p.venue_user_id)
        .maybeSingle<{ name: string | null }>();
      if (venueProfile?.name) venueName = venueProfile.name;
    }

    // Both sides get the same reminder. Separate sends, separate keys: one
    // party's opt-out, bounce or throttle must not silence the other's.
    for (const userId of [p.artist_user_id, p.venue_user_id]) {
      if (!userId) continue;
      try {
        const { data: { user } } = await db.auth.admin.getUserById(userId);
        if (!user?.email) {
          skipped += 1;
          continue;
        }

        // Keyed per placement, per party, per END DATE. The date in the key is
        // what makes a re-run (or the catch-up tail) a no-op while still
        // letting a genuinely moved end date earn a fresh reminder.
        const key = `placement_ending_soon:${p.id}:${userId}:${endDate}`;

        createNotification({
          userId,
          kind: "placement_ending_soon",
          title: `Placement at ${venueName} ends ${endDateLabel}`,
          body: "Extend it, or arrange collection.",
          link: `/placements/${encodeURIComponent(p.id)}`,
          idempotencyKey: key,
        }).catch((err) => console.warn("[placement-ending-soon] notification failed:", err));

        const result = await sendEmail({
          idempotencyKey: key,
          template: "placement_ending_soon",
          category: "placements",
          to: user.email,
          subject: `Placement at ${venueName} ends ${endDateLabel}`,
          userId,
          react: PlacementEndingSoon({
            firstName: (user.user_metadata?.first_name as string | undefined) || "there",
            placementUrl,
            venueName,
            endDate: endDateLabel,
            returnInstructionsUrl: `${placementUrl}?record=open`,
            extendPlacementUrl: `${placementUrl}?extend=1`,
          }),
          metadata: { placementId: p.id, endDate },
        });

        if (!result.ok) {
          failed += 1;
          console.error("[placement-ending-soon] send failed for", p.id, userId, result.error);
        } else if (result.skipped) {
          if (result.reason === "duplicate") deduped += 1;
          else skipped += 1;
        } else {
          sent += 1;
        }
      } catch (err) {
        console.error("[placement-ending-soon] failed for", p.id, userId, err);
        failed += 1;
      }
    }
  }

  // WS6.5: an all-failed run answers 500 and alerts admin; dedups and benign
  // skips count as processed, not failed.
  return finishCronRun(
    "placement-ending-soon",
    { succeeded: sent + deduped + skipped, failed },
    { sent, deduped, skipped, failed, window: { from: windowStart, to: windowEnd } },
  );
}
