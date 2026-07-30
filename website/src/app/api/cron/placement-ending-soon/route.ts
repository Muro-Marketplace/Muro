// Vercel Cron, daily 10:00 UTC. GATED OFF — row 19 #2 / EXECUTION-DECISIONS D60.
//
// The "placement ending soon" reminder keyed on `placements.end_date`, a column
// that does not exist. `placements` has no planned-end concept at all: every
// date column on it is a PAST event (accepted_at, installed_at, collected_at,
// cancelled_at) except `subscription_current_period_end`, which is Stripe-managed
// and paid-loan-only. So a reminder 14 days BEFORE an end has nothing to fire on,
// and this cron has never sent a single email (the phantom select was rejected
// whole every run). Reworking onto `placement_records.collection_date` was ruled
// out on the data: 1 of 37 active placements has one, 0 in the future (D60.2).
//
// This is the reversible interim (option c): the handler no longer runs the
// phantom query and returns a clear skip, so the job stops appearing healthy while
// doing nothing. The OWNER decides between (b) building a real
// `placements.end_date` data model (populate on accept) and re-enabling, or (c)
// removing this route + its vercel.json entry + the PlacementEndingSoon template.

import { NextResponse } from "next/server";
import { requireCronAuth } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    skipped:
      "placements has no planned end-date column; the ending-soon reminder is not built "
      + "(see EXECUTION-DECISIONS D60 / PROGRESS row 19 #2). Owner to decide (b) build "
      + "placements.end_date, or (c) remove this cron.",
  });
}
