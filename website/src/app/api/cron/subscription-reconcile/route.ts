// Vercel Cron, daily 07:30 UTC. Reconciles subscription STATE against Stripe.
//
// WS4.7 / audit R2.17: every subscription surface (SaaS plans, paid-loan
// billing, curation retainers) is written by webhooks alone, so a missed or
// dropped event leaves the books wrong forever: an artist delisted after a
// dunning event that never arrived, a venue's "Monthly payment active" chip
// showing green years after cancellation. This sweep asks Stripe for the
// truth on every row the DB believes is live and corrects drift toward
// Stripe, alerting admin with what it changed. It corrects statuses only; it
// never creates or cancels anything.
//
// Wired in vercel.json; runs locally via:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/subscription-reconcile

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { stripe } from "@/lib/stripe";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { requireCronAuth, finishCronRun } from "../_auth";

export const dynamic = "force-dynamic";

// Per-table cap per run. At today's scale a run covers everything; at any
// scale the daily cadence converges within days rather than never.
const MAX_ROWS = 50;

interface Correction {
  table: string;
  id: string;
  subscriptionId: string;
  from: string;
  to: string;
}

async function stripeStatusOf(subscriptionId: string): Promise<string> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return sub.status;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/No such subscription/i.test(msg)) return "canceled";
    throw err;
  }
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const corrections: Correction[] = [];
  let succeeded = 0;
  let failed = 0;

  // ── SaaS plans: artist_profiles ──
  // Statuses the DB considers live-ish; anything Stripe disagrees with gets
  // Stripe's answer verbatim (the webhook writes these same strings).
  try {
    const { data: profiles } = await db
      .from("artist_profiles")
      .select("id, stripe_subscription_id, subscription_status")
      .in("subscription_status", ["active", "trialing", "past_due", "incomplete"])
      .not("stripe_subscription_id", "is", null)
      .limit(MAX_ROWS);
    for (const row of (profiles || []) as Array<{ id: string; stripe_subscription_id: string; subscription_status: string }>) {
      try {
        const live = await stripeStatusOf(row.stripe_subscription_id);
        if (live !== row.subscription_status) {
          const { error } = await db
            .from("artist_profiles")
            .update({ subscription_status: live === "canceled" ? "canceled" : live })
            .eq("id", row.id);
          if (error) throw new Error(error.message);
          corrections.push({
            table: "artist_profiles",
            id: row.id,
            subscriptionId: row.stripe_subscription_id,
            from: row.subscription_status,
            to: live,
          });
        }
        succeeded += 1;
      } catch (err) {
        console.error("[cron/subscription-reconcile] artist row failed:", { id: row.id, err });
        failed += 1;
      }
    }
  } catch (err) {
    console.error("[cron/subscription-reconcile] artist query failed:", err);
    failed += 1;
  }

  // ── Paid-loan billing ledger ──
  try {
    const { data: billings } = await db
      .from("placement_recurring_billings")
      .select("id, placement_id, stripe_subscription_id, status")
      .in("status", ["active", "past_due", "paused"])
      .not("stripe_subscription_id", "is", null)
      .limit(MAX_ROWS);
    for (const row of (billings || []) as Array<{ id: string; placement_id: string; stripe_subscription_id: string; status: string }>) {
      try {
        const live = await stripeStatusOf(row.stripe_subscription_id);
        // Ledger vocabulary: active | past_due | paused | cancelled.
        const mapped =
          live === "canceled" ? "cancelled"
          : live === "past_due" || live === "unpaid" ? "past_due"
          : live === "paused" ? "paused"
          : "active";
        if (mapped !== row.status) {
          const { error } = await db
            .from("placement_recurring_billings")
            .update({ status: mapped, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          if (error) throw new Error(error.message);
          // Keep the placements chip honest too (the R2.7 mirror).
          //
          // The mirror column carries its own CHECK (migration 025:
          // active | past_due | canceled | incomplete | trialing), which is
          // NOT the ledger's vocabulary: the ledger's "paused" would be
          // rejected outright. Map into the column's own terms, and CHECK THE
          // ERROR: a silently rejected mirror write is precisely the stale
          // green "Monthly payment active" chip this cron exists to kill.
          const mirrored =
            mapped === "cancelled" ? "canceled"
            : mapped === "paused" ? "past_due"
            : mapped;
          const { error: mirrorErr } = await db
            .from("placements")
            .update({ subscription_status: mirrored })
            .eq("id", row.placement_id);
          if (mirrorErr) {
            console.error("[cron/subscription-reconcile] placements mirror failed:", {
              placementId: row.placement_id,
              mirrored,
              message: mirrorErr.message,
            });
            throw new Error(`placements mirror: ${mirrorErr.message}`);
          }
          corrections.push({
            table: "placement_recurring_billings",
            id: row.id,
            subscriptionId: row.stripe_subscription_id,
            from: row.status,
            to: mapped,
          });
        }
        succeeded += 1;
      } catch (err) {
        console.error("[cron/subscription-reconcile] billing row failed:", { id: row.id, err });
        failed += 1;
      }
    }
  } catch (err) {
    console.error("[cron/subscription-reconcile] billing query failed:", err);
    failed += 1;
  }

  // ── Curation retainers ──
  try {
    const { data: curations } = await db
      .from("curation_requests")
      .select("id, stripe_subscription_id, status")
      .eq("status", "in_progress")
      .not("stripe_subscription_id", "is", null)
      .limit(MAX_ROWS);
    for (const row of (curations || []) as Array<{ id: string; stripe_subscription_id: string; status: string }>) {
      try {
        const live = await stripeStatusOf(row.stripe_subscription_id);
        if (live === "canceled") {
          const { error } = await db
            .from("curation_requests")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", row.id);
          if (error) throw new Error(error.message);
          corrections.push({
            table: "curation_requests",
            id: row.id,
            subscriptionId: row.stripe_subscription_id,
            from: row.status,
            to: "cancelled",
          });
        }
        succeeded += 1;
      } catch (err) {
        console.error("[cron/subscription-reconcile] curation row failed:", { id: row.id, err });
        failed += 1;
      }
    }
  } catch (err) {
    console.error("[cron/subscription-reconcile] curation query failed:", err);
    failed += 1;
  }

  if (corrections.length > 0) {
    try {
      await sendAdminAlert({
        idempotencyKey: `subscription_reconcile:${new Date().toISOString().slice(0, 10)}`,
        subject: `Subscription reconcile corrected ${corrections.length} row(s)`,
        summary:
          "The daily Stripe reconcile found subscription states the webhooks missed and corrected them toward Stripe. " +
          "Each correction means an event was dropped or never arrived; if these recur, check the webhook endpoint's enabled events.",
        fields: corrections.slice(0, 10).map((c) => ({
          label: `${c.table} ${c.id}`,
          value: `${c.from} -> ${c.to} (${c.subscriptionId})`,
        })),
        metadata: { corrections: corrections.length },
      });
    } catch (alertErr) {
      console.error("[cron/subscription-reconcile] alert failed:", alertErr);
    }
  }

  return finishCronRun("subscription-reconcile", { succeeded, failed }, {
    checked: succeeded,
    corrected: corrections.length,
    failed,
  });
}
