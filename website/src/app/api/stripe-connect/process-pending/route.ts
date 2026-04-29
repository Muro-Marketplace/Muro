import { NextResponse } from "next/server";
import { processPendingTransfers } from "@/lib/stripe-connect";

/**
 * POST /api/stripe-connect/process-pending
 *
 * Processes all pending transfers that have passed their 14-day hold period.
 * Call this via a cron job (e.g. Vercel Cron, daily) or manually from admin.
 *
 * Protected by a simple secret token to prevent abuse.
 */
export async function POST(request: Request) {
  // Fail CLOSED, refuse the request if the cron secret isn't configured,
  // otherwise the route was effectively unauthenticated in any environment
  // that didn't set the env var (the old `if (cronSecret && …)` guard was
  // skipped when cronSecret was falsy, so anyone could trigger a payout
  // run). This now rejects both missing-secret and wrong-secret equally.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not set, refusing process-pending request");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingTransfers();
    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors?.length ? result.errors : undefined,
    });
  } catch (err) {
    console.error("Process pending transfers error:", err);
    return NextResponse.json(
      { error: "Failed to process pending transfers" },
      { status: 500 }
    );
  }
}
