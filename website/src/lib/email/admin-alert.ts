// Operational alerts to the Wallplace team, through the one email pipeline.
//
// K1 (07 §1). `src/lib/email.ts` carried eight of these, each a near-copy:
// hand-written HTML, its own Resend client, a hardcoded `from` on an unverified
// domain, and no idempotency key, suppression check or `email_events` row. They
// differed only in the heading and which fields they listed, so they are one
// function with arguments.
//
// Going through `sendEmail` is the point, not a formality. It brings the audit
// trail (a row per attempt, so "did that alert actually send?" is answerable),
// the verified sending domain, and idempotency: a Stripe redelivery or a retried
// route used to mean a second identical alert.

import { adminEmails } from "@/lib/admin-auth";
import { AdminAlert, type AdminAlertField } from "@/emails/templates/admin/AdminAlert";
import { sendEmail, type SendEmailResult } from "./send";

/**
 * Where operational alerts go.
 *
 * The SAME list admin-auth authorises against, imported rather than re-read:
 * operational alerts go to the people who can act on them, by construction. The
 * legacy module read the env itself and defaulted to a hardcoded personal
 * address, so a misconfigured deploy silently mailed one inbox with no way to
 * tell. This returns null instead, and the caller logs loudly.
 */
export function adminAlertRecipient(): string | null {
  return adminEmails()[0] ?? null;
}

export interface AdminAlertInput {
  /**
   * Stable dedupe key. Include the id of whatever the alert is ABOUT, not a
   * timestamp: the point is that a retry or a webhook redelivery does not send
   * a second copy.
   */
  idempotencyKey: string;
  /** Subject line, and the in-body heading unless `heading` overrides it. */
  subject: string;
  heading?: string;
  summary: string;
  fields?: AdminAlertField[];
  actionPath?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

export async function sendAdminAlert(input: AdminAlertInput): Promise<SendEmailResult> {
  const to = adminAlertRecipient();
  if (!to) {
    // Fail loud, per 09 Phase 0. The legacy version returned silently here and
    // an operator had no way to know alerts were going nowhere.
    console.error(
      "[admin-alert] ADMIN_EMAILS/ADMIN_EMAIL is not set, so this alert has nowhere to go:",
      input.subject,
    );
    return { ok: false, error: "No admin recipient configured" };
  }

  const actionPath = input.actionPath ?? "/admin";
  return sendEmail({
    idempotencyKey: input.idempotencyKey,
    template: "admin_alert",
    category: "platform_admin",
    to,
    subject: input.subject,
    react: AdminAlert({
      heading: input.heading ?? input.subject,
      summary: input.summary,
      fields: input.fields ?? [],
      actionUrl: `${siteOrigin()}${actionPath}`,
      actionLabel: input.actionLabel,
    }),
    metadata: input.metadata,
  });
}
