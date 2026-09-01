// Phase 2.3 (J1). Single entry point for "the order's status just
// changed, please write the matching order_events row and dispatch
// the corresponding email". Pulls the event_type from the Phase 2.0b
// vocabulary helper and the template / recipient logic from a tight
// internal mapping below.
//
// Idempotency: order_events.idempotency_key is UNIQUE in the schema
// (mig 059). We use `${order_id}:${event_type}` as the key, so the same
// status flip retried by Stripe / a UI re-click doesn't double-fire
// the email. The dispatcher then suffixes the key with the spec
// template name, giving every (event_type, recipient_type) pair its
// own email_events row.
//
// What this file does NOT own:
//   - status validation (canTransition lives in order-state-machine.ts)
//   - the PATCH / webhook orchestrator (callers stay in route handlers)

import { sendTransactional, type TransactionalTemplate } from "@/lib/email/dispatcher";
import { eventForStatus, type OrderEventType } from "@/lib/orders/event-vocabulary";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderLifecycleInput {
  orderId: string;
  /** New legacy status that just landed. Drives the event_type. */
  newStatus: string;
  /** Optional user id that triggered the transition (artist / venue / admin). */
  actorUserId?: string | null;
  /** Customer email — receives all customer-facing templates. */
  buyerEmail?: string | null;
  /** Artist email — receives ArtistOrderReceived on order.placed only. */
  artistEmail?: string | null;
  /** R4.10: recipient identities for preference/suppression resolution.
   *  Distinct from actorUserId, which is whoever CLICKED. */
  buyerUserId?: string | null;
  artistUserId?: string | null;
  /** Optional template props passed through to the email body. The
   *  dispatcher already substitutes {{tokens}} in the registry subject,
   *  the component reads everything else. Caller decides what to send
   *  through (firstName, workTitle, orderUrl, ...). */
  data: Record<string, unknown>;
  /** Optional metadata stored on the order_events row. */
  metadata?: Record<string, unknown>;
}

interface EmailTrigger {
  to: string | null | undefined;
  template: TransactionalTemplate;
  /** Whose mailbox this lands in, for preference/suppression identity. */
  recipient: "buyer" | "artist";
}

/**
 * Per event_type, which template(s) we fire and who to. Returns an
 * empty array for events that have no email surface (cancel, refund —
 * handled by existing legacy templates today; Phase 3 will tighten).
 */
function emailsForEvent(
  event: OrderEventType,
  input: OrderLifecycleInput,
): EmailTrigger[] {
  switch (event) {
    case "order.placed":
      return [
        { to: input.artistEmail, template: "artist_order_received", recipient: "artist" },
        { to: input.buyerEmail, template: "order_placed", recipient: "buyer" },
      ];
    case "order.processing":
      return [{ to: input.buyerEmail, template: "order_processing", recipient: "buyer" }];
    case "order.out_for_delivery":
      return [{ to: input.buyerEmail, template: "order_out_for_delivery", recipient: "buyer" }];
    case "order.delivered":
      // Row 874. The buyer's three templates fired and the artist got nothing
      // on any transition, including this one, which ends the payout hold and
      // releases their money. Processing and out-for-delivery are the artist's
      // own clicks and telling them what they just did would be noise; this is
      // somebody else's action and it moves their money.
      return [
        { to: input.buyerEmail, template: "order_delivered", recipient: "buyer" },
        { to: input.artistEmail, template: "artist_order_delivered", recipient: "artist" },
      ];
    case "order.cancelled":
      // 09 item 1.5: this used to return [] and a second branch inside
      // orders/route.ts sent the cancellation, so which email an order event
      // produces had two owners. One owner now.
      return [{ to: input.buyerEmail, template: "order_cancelled", recipient: "buyer" }];
    case "order.disputed":
      // 09 item 3.7. The dispute route mails both parties itself, keyed on the
      // dispute id, because it knows who they are and this function only knows
      // the two addresses the CALLER passed in. Returning a trigger here would
      // mean two emails for one dispute.
      return [];
    case "order.refunded":
    case "order.delivery_confirmed":
      // Deliberately still empty. A refund already emails the buyer from
      // refunds/process (CustomerRefundConfirmation), and adding a second
      // trigger here would send two emails for one refund — the exact defect
      // K1 just removed from that route. Consolidating those is Phase 3's.
      return [];
  }
}

/**
 * Record the order_events row and fire the matching email(s).
 * Returns the event_type that was logged (null when the source status
 * has no mapped event).
 */
export async function recordOrderEvent(
  input: OrderLifecycleInput,
  client?: SupabaseClient,
): Promise<{ eventType: OrderEventType | null; sent: number; deduped: number }> {
  const event = eventForStatus(input.newStatus);
  if (!event) return { eventType: null, sent: 0, deduped: 0 };

  const db = client ?? getSupabaseAdmin();
  const idempotencyKey = `${input.orderId}:${event}`;

  // INSERT … ON CONFLICT(idempotency_key) DO NOTHING via Supabase
  // .upsert(); we don't care what came back, just that the row is
  // present exactly once.
  await db
    .from("order_events")
    .upsert(
      {
        order_id: input.orderId,
        event_type: event,
        actor_user_id: input.actorUserId ?? null,
        metadata: input.metadata ?? null,
        idempotency_key: idempotencyKey,
      },
      { onConflict: "idempotency_key" },
    );

  let sent = 0;
  let deduped = 0;
  for (const trigger of emailsForEvent(event, input)) {
    if (!trigger.to) continue;
    // R4.10: the userId used to be the ACTOR's, so a seller marking
    // "shipped" stamped their own id on the buyer's email - preference
    // resolution, suppression and throttling all ran against the wrong
    // person. It is now the recipient's id (undefined when unknown, e.g.
    // guest buyers), never the actor's.
    const recipientUserId =
      trigger.recipient === "buyer" ? input.buyerUserId : input.artistUserId;
    const result = await sendTransactional({
      to: trigger.to,
      template: trigger.template,
      data: input.data,
      idempotencyKey,
      userId: recipientUserId ?? undefined,
    });
    if (result.sent && !result.deduped) sent++;
    if (result.sent && result.deduped) deduped++;
  }

  return { eventType: event, sent, deduped };
}
