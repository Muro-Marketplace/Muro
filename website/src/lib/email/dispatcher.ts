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
// table rather than spinning up a parallel email_sends one — captured as
// a deviation in the Phase 2 readiness report.
//
// Phase 2 will own writing purpose-built templates per spec name. Today
// the four spec names bind to the closest existing registry entries.
// Note: order_delivered and customer_confirm_delivery both bind to
// customer_delivery_confirmation, so until Phase 2 splits them the
// customer will receive two copies of the same email body (with
// different idempotency keys, which is correct — they're distinct
// logical events from the order_events log).

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

// Registry subject lines use `{{tokenName}}` placeholders (see
// registry-types.ts). Substitute against `data` before the wire so the
// inbox doesn't show the literal token. Unmatched tokens are left in
// place to surface the gap during testing rather than silently dropping.
function substituteTokens(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return match;
    return typeof val === "string" ? val : String(val);
  });
}

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
 *                                     error, missing template, missing
 *                                     RESEND_API_KEY).
 *
 * Never throws. Email is best-effort, callers should not bubble up failures
 * to the user. The underlying sendEmail() pipeline writes every attempt to
 * email_events for audit/debug.
 *
 * Idempotency keys are suffixed with the spec template name before being
 * passed to sendEmail. That way two spec templates that resolve to the
 * same registry entry (e.g. order_delivered + customer_confirm_delivery
 * both bound to customer_delivery_confirmation) don't dedupe against
 * each other — each logical event gets its own record in email_events.
 *
 * Phase 2 note: `data` is intentionally untyped here so the spec template
 * union stays narrow. Trigger sites should bind their data shape to the
 * template's exported props interface (see e.g. CustomerOrderReceiptProps)
 * before calling.
 */
export async function sendTransactional(
  input: SendTransactionalInput,
): Promise<SendTransactionalResult> {
  const registryId = TEMPLATE_BINDINGS[input.template];
  const entry = findTemplate(registryId) as TemplateEntry<Record<string, unknown>> | undefined;
  if (!entry) {
    // Binding points at a template that hasn't been imported into the
    // registry yet. Soft-fail so order webhooks don't 500. Phase 2 wiring
    // must ensure all four bindings resolve before flipping triggers on.
    console.warn(
      `[email/dispatcher] template not in registry for "${input.template}" (binding=${registryId})`,
    );
    return { sent: false, deduped: false };
  }

  const Component = entry.component;
  const result = await sendEmail({
    idempotencyKey: `${input.idempotencyKey}:${input.template}`,
    template: registryId,
    category: entry.category,
    to: input.to,
    subject: substituteTokens(entry.subject, input.data),
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
