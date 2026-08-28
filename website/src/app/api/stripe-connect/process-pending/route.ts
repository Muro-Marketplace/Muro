import { NextResponse } from "next/server";
import { processPendingTransfers, reconcileOrdersWithoutLegs } from "@/lib/stripe-connect";
import { requireCronAuth } from "@/app/api/cron/_auth";

/**
 * /api/stripe-connect/process-pending
 *
 * Walks every `stripe_transfers` row in `status='pending'` whose
 * `payout_after` has passed and fires the Stripe transfer. This is what
 * actually moves the venue's revenue-share cut + the artist's net into
 * their Connect accounts on shipped orders, the 14-day hold is just
 * the `payout_after` timestamp; nothing pays anyone out until this
 * endpoint runs.
 *
 * Wired into Vercel Cron via vercel.json. Vercel sends a GET request
 * with `Authorization: Bearer ${CRON_SECRET}` attached automatically
 * when the secret is set in the project env. We accept both GET (the
 * cron path) and POST (admin / manual reprocessing) so the same handler
 * services both.
 */
async function handle(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await processPendingTransfers();
    // D52.3: also catch orders that are owed money but have NO ledger row at all,
    // which a retry-existing-rows sweep is blind to. Recorded as blocked legs so
    // an operator sees the owed money.
    const reconciled = await reconcileOrdersWithoutLegs();
    return NextResponse.json({
      success: true,
      processed: result.processed,
      retried: result.retried,
      exhausted: result.exhausted,
      reconciledFlagged: reconciled.flagged,
      // D55.3: the order ids, not just a count, so an operator can chase them.
      reconciledUnresolved: reconciled.unresolved,
      reconciledUnresolvedCount: reconciled.unresolved.length,
      errors: [...result.errors, ...reconciled.errors].length
        ? [...result.errors, ...reconciled.errors]
        : undefined,
    });
  } catch (err) {
    console.error("Process pending transfers error:", err);
    return NextResponse.json(
      { error: "Failed to process pending transfers" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
