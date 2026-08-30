import { getSupabaseAdmin } from "@/lib/supabase-admin";

interface CreateNotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  /**
   * Optional stable dedupe key (R6.F6). When set, the insert rides the
   * partial unique index on notifications.idempotency_key (migration 123)
   * and a second insert with the same key is a silent no-op, so Stripe
   * redeliveries, cron re-runs and repeated stage PATCHes cannot
   * double-bell. Use a semantic id naming what the bell is ABOUT, e.g.
   * `placement_installed:{placementId}:{userId}` or
   * `qr_scan_digest:{userId}:{day}`, never a timestamp. Callers without a
   * key keep today's behaviour (no dedup).
   */
  idempotencyKey?: string;
}

/**
 * Fire-and-forget notification insert. Swallows errors so the caller's
 * primary action (e.g. creating a placement) is not blocked by a missing
 * notifications table or transient DB issue.
 *
 * Errors log to console.error so they're picked up by Vercel function
 * log filters. A swallowed insert that the bell never surfaces is one
 * of the few "silent" failure modes left in the order pipeline, so it's
 * worth logging loudly. The one exception: a unique violation on
 * idempotency_key means the bell already exists, which is the dedup
 * working, not a failure.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.userId) {
    console.error("[notifications] skipped, missing userId", { kind: input.kind, title: input.title });
    return;
  }
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body || "",
      link: input.link || "",
      idempotency_key: input.idempotencyKey || null,
    });
    if (error) {
      if (input.idempotencyKey && (error as { code?: string }).code === "23505") {
        // Duplicate key: this exact bell was already inserted (redelivery,
        // re-run, concurrent caller). Silent success by design.
        return;
      }
      console.error("[notifications] insert failed:", {
        message: error.message,
        code: (error as { code?: string }).code,
        userId: input.userId,
        kind: input.kind,
      });
    }
  } catch (err) {
    console.error("[notifications] insert threw:", err);
  }
}
