import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 09 §A.6 layer 3, the health route.
 *
 * Layer 1 (the boot assertion) only catches a key that is missing at start-up;
 * this catches one revoked afterwards, and any send actually dropped for want of
 * a key. Returns 503 when config is incomplete or when anything was dropped in
 * the last 24 hours, so an uptime monitor on a 5-minute interval pages.
 *
 * Booleans only. The values themselves must never appear in the response: this
 * route is unauthenticated by design (a monitor has no session), so it reports
 * presence and counts and nothing else.
 */
const WATCHED_ENV = [
  "RESEND_API_KEY",
  "EMAIL_FROM_TX",
  "EMAIL_FROM_NOTIFY",
  "EMAIL_FROM_NEWS",
  "CRON_SECRET",
  "SUPABASE_WEBHOOK_SECRET",
  // WS5.2: without this the Resend webhook refuses every delivery, so bounces
  // and complaints never reach email_suppressions and dead addresses are
  // retried forever. An unset secret is dead email infrastructure, which is
  // exactly what this route exists to surface.
  "RESEND_WEBHOOK_SECRET",
] as const;

/**
 * Statuses worth counting. Everything except `sent` fails health (WS5.4,
 * R4.8): `failed` and `render_failed` are provider or template breakage, and
 * `dry_run` in the window means EMAIL_DRY_RUN leaked into a live environment,
 * which used to leave this route green through a total outage.
 */
const WATCHED_STATUSES = ["sent", "failed", "skipped_no_api_key", "render_failed", "dry_run"] as const;

/** The subset of WATCHED_STATUSES whose presence in the last 24h means unhealthy. */
const FAILING_STATUSES = ["failed", "render_failed", "dry_run", "skipped_no_api_key"] as const;

export async function GET() {
  const env = Object.fromEntries(
    WATCHED_ENV.map((k) => {
      const v = process.env[k];
      // A blank value is as broken as an absent one and much easier to miss.
      return [k, typeof v === "string" && v.trim() !== ""];
    }),
  ) as Record<(typeof WATCHED_ENV)[number], boolean>;

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const counts: Record<string, number> = {};
  let dbReachable = true;

  try {
    const db = getSupabaseAdmin();
    for (const status of WATCHED_STATUSES) {
      const { count, error } = await db
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      counts[status] = count ?? 0;
    }
  } catch {
    // A monitor must not read "healthy" just because we could not check. Report
    // the outage rather than a false all-clear.
    dbReachable = false;
  }

  const healthy =
    dbReachable &&
    Object.values(env).every(Boolean) &&
    FAILING_STATUSES.every((s) => (counts[s] ?? 0) === 0);

  return NextResponse.json(
    { healthy, env, dbReachable, last24h: counts },
    { status: healthy ? 200 : 503 },
  );
}
