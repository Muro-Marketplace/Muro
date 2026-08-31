// Vercel Cron, daily 10:30 UTC. Warns artists whose referral fee-free window
// (artist_profiles.free_until) lapses within the next few days.
//
// WS3.5 (audit R7 row 14): the window used to expire silently, so an artist
// pricing work around a 0% platform fee was re-charged the standard fee
// mid-programme with no warning and no surface showing the date. One warning
// per (artist, window-end): the email idempotency key carries the free_until
// date, so a daily rerun is a no-op, and an EXTENDED window (a fresh credit
// moving free_until) naturally earns a fresh warning for the new date.
//
// Wired in vercel.json; runs locally via:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/referral-window

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { ReferralWindowEnding } from "@/emails/templates/payments/ReferralWindowEnding";
import { DEFAULT_PLAN_FEE_PERCENT } from "@/lib/platform-fee";
import { requireCronAuth, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// Warn while there is still time to act on it (refer someone, reprice).
const WARN_WINDOW_DAYS = 4;

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const now = new Date();
  const horizon = new Date(now.getTime() + WARN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data: expiring, error } = await db
    .from("artist_profiles")
    .select("id, user_id, name, free_until")
    .gt("free_until", now.toISOString())
    .lte("free_until", horizon.toISOString());
  if (error) {
    console.error("[cron/referral-window] query failed:", error);
    return finishCronRun("referral-window", { succeeded: 0, failed: 1 }, { warned: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  for (const row of (expiring || []) as Array<{
    id: string;
    user_id: string | null;
    name: string | null;
    free_until: string;
  }>) {
    try {
      if (!row.user_id) continue;
      const { data: { user } } = await db.auth.admin.getUserById(row.user_id);
      if (!user?.email) continue;
      const endDay = row.free_until.slice(0, 10);
      const freeUntilDate = new Date(row.free_until).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      createNotification({
        userId: row.user_id,
        kind: "referral_window_ending",
        title: `Your 0% fee window ends ${freeUntilDate}`,
        body: `Sales confirmed after that date carry the standard ${DEFAULT_PLAN_FEE_PERCENT}% platform fee again.`,
        link: "/artist-portal/billing",
        idempotencyKey: `referral_window_ending:${row.id}:${endDay}`,
      }).catch((err) => console.warn("[cron/referral-window] bell failed:", err));
      await sendEmail({
        idempotencyKey: `referral_window_ending:${row.id}:${endDay}`,
        template: "referral_window_ending",
        category: "orders_and_payouts",
        to: user.email,
        userId: row.user_id,
        subject: "Your fee-free window ends soon",
        react: ReferralWindowEnding({
          firstName: (row.name || "there").split(" ")[0],
          freeUntilDate,
          standardFee: `${DEFAULT_PLAN_FEE_PERCENT}%`,
          billingUrl: `${SITE}/artist-portal/billing`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { artistProfileId: row.id, freeUntil: row.free_until },
      });
      succeeded += 1;
    } catch (err) {
      console.error("[cron/referral-window] item failed:", { profileId: row.id, err });
      failed += 1;
    }
  }

  return finishCronRun("referral-window", { succeeded, failed }, {
    warned: succeeded,
    failed,
    scanned: (expiring || []).length,
  });
}
