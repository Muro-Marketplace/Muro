// Phase 1 chunk 1c. Single-purpose dispatcher for the four transactional
// order-lifecycle templates the Phase 2 backfill triggers will fire:
//
//   - order_placed
//   - order_processing
//   - order_delivered
//   - customer_confirm_delivery
//
// Wraps the existing sendEmail() pipeline (src/lib/email/send.ts), which
// already does idempotency-keyed inserts into email_events. We reuse that
// table rather than spinning up a parallel email_sends one — that's the
// only deviation from the Phase 1 spec for 1c, captured in the migration
// notes / Phase 2 readiness report.
//
// The mapping from spec template name → existing registry id is a best-
// effort placeholder. Phase 2 may add purpose-built order_placed /
// order_processing etc. templates and rebind these slots; the dispatcher
// API stays the same.

import { findTemplate } from "@/emails/registry";
import type { TemplateEntry } from "@/emails/registry-types";
import { sendEmail } from "@/lib/email/send";
import { createElement } from "react";

export type TransactionalTemplate =
  | "order_placed"
  | "order_processing"
  | "order_delivered"
  | "customer_confirm_delivery";

export interface SendTransactionalInput {
  to: string;
  template: TransactionalTemplate;
  data: Record<string, unknown>;
  idempotencyKey: string;
  /** Optional user id, gives the underlying sendEmail() user-level idempotency context. */
  userId?: string;
}

export interface SendTransactionalResult {
  sent: boolean;
  deduped: boolean;
}

// Each spec template name binds to the closest existing registry entry.
// Phase 2 owns rewriting these to purpose-built templates if needed.
const TEMPLATE_BINDINGS: Record<TransactionalTemplate, string> = {
  order_placed: "customer_order_receipt",
  order_processing: "customer_shipping_confirmation",
  order_delivered: "customer_delivery_confirmation",
  customer_confirm_delivery: "customer_delivery_confirmation",
};

/**
 * Send a transactional order email with idempotency. Returns `{sent, deduped}`
 * per the Phase 1 spec.
 *
 *  - `sent: true,  deduped: false`  → email delivered (or queued) for the first
 *                                     time with this idempotency key.
 *  - `sent: true,  deduped: true`   → the key has been used before, the
 *                                     dispatcher short-circuited without
 *                                     calling Resend.
 *  - `sent: false, deduped: false`  → blocked or failed (suppressed,
 *                                     opted out, throttled, render/transport
 *                                     error, missing template).
 *
 * Never throws. Email is best-effort, callers should not bubble up failures
 * to the user. The underlying sendEmail() pipeline writes every attempt to
 * email_events for audit/debug.
 */
export async function sendTransactional(
  input: SendTransactionalInput,
): Promise<SendTransactionalResult> {
  const registryId = TEMPLATE_BINDINGS[input.template];
  const entry = findTemplate(registryId) as TemplateEntry<Record<string, unknown>> | undefined;
  if (!entry) {
    // The binding points at a template that hasn't been imported into the
    // registry yet. Treat it as a soft failure rather than throwing so
    // callers don't 500 on an order webhook. The Phase 2 wiring step needs
    // to ensure all four bindings resolve before flipping triggers on.
    console.warn(
      `[email/dispatcher] template not in registry for "${input.template}" (binding=${registryId})`,
    );
    return { sent: false, deduped: false };
  }

  const Component = entry.component;
  const result = await sendEmail({
    idempotencyKey: input.idempotencyKey,
    template: registryId,
    category: entry.category,
    to: input.to,
    subject: entry.subject,
    react: createElement(Component, input.data),
    userId: input.userId,
    metadata: { dispatcher: "transactional", template: input.template },
  });

  if (!result.ok) {
    return { sent: false, deduped: false };
  }
  if (result.skipped) {
    return result.reason === "duplicate"
      ? { sent: true, deduped: true }
      : { sent: false, deduped: false };
  }
  return { sent: true, deduped: false };
}
