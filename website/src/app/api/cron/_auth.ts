// Shared auth check for cron routes. Vercel Cron hits these with a bearer
// token equal to CRON_SECRET — anything else gets a 401 so random public
// callers can't trigger email blasts.
//
// In local dev, set CRON_SECRET in .env.local and curl with:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-artist-digest

import { NextResponse } from "next/server";

export function requireCronAuth(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail-closed in production. In dev, warn once and let it through.
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET not set — refusing cron request");
      return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
    }
    console.warn("CRON_SECRET not set — allowing cron in dev only");
    return null;
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Runs a batched loop with graceful per-item error handling. Used by cron
 * routes that walk a large user set — one bad row shouldn't abort the job.
 */
export async function runBatch<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await worker(item);
      succeeded++;
    } catch (err) {
      failed++;
      console.error("cron batch item failed:", err);
    }
  }
  return { succeeded, failed };
}
