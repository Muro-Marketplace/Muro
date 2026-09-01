// Task 7: quarterly Wallplace Programmes rent settlement.
//
// Vercel Cron has no "quarterly" unit (vercel.json crons are standard
// 5-field cron), so this is wired MONTHLY, on the 1st at 09:00 UTC.
// settleProgrammeRent (src/lib/curation/programme-rent.ts) is what actually
// enforces the quarterly cadence: it only settles accruals from a CLOSED
// prior quarter relative to `asOf`, never the quarter still open around it,
// so most monthly runs find nothing new and one run per quarter does the
// real work. See that module's header for why "settle everything unsettled
// every run" — the simpler alternative — was rejected: it would pay artists
// out on whatever cadence accruals land, defeating the reason settlement is
// quarterly at all (Stripe's ~£1.60/connected-account/month-with-activity
// fee).
//
// `new Date()` is deliberately called HERE, once, and passed in as `asOf` —
// settleProgrammeRent itself never reads the clock, so it stays testable and
// deterministic (see its own header).
//
// Wired in vercel.json; runs locally via:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/programme-rent-settlement

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { settleProgrammeRent } from "@/lib/curation/programme-rent";
import { requireCronAuth } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();

  try {
    const result = await settleProgrammeRent(db, { asOf: new Date() });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Mirrors accrueProgrammeRent's own contract: the one throw left inside
    // settleProgrammeRent is the upstream accrual SELECT failing (a real DB
    // outage), which is this caller's problem, not something a per-artist
    // try/catch inside the module could have absorbed.
    console.error("[programme-rent-settlement] cron failed:", err);
    return NextResponse.json({ error: "Settlement failed" }, { status: 500 });
  }
}
