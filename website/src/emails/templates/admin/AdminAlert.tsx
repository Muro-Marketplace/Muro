// Stream: tx. Internal operational alert to the Wallplace team.
//
// K1 (07 §1). `src/lib/email.ts` had eight admin notifiers, each a near-copy of
// the others: hand-written HTML, a hardcoded unverified `from`, its own Resend
// client, and no idempotency key, suppression check or `email_events` row. They
// differed only in the heading and which fields they listed.
//
// One template with a label/value list replaces all eight. Adding a ninth kind
// of alert is now a call, not a file.

import { EmailShell, H1, P, InfoBox, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AdminAlertField {
  label: string;
  value: string;
}

export interface AdminAlertProps {
  /** Short headline, e.g. "New artist application". */
  heading: string;
  /** One sentence of context. */
  summary: string;
  fields: AdminAlertField[];
  actionUrl?: string;
  actionLabel?: string;
}

export function AdminAlert({ heading, summary, fields, actionUrl, actionLabel }: AdminAlertProps) {
  return (
    <EmailShell stream="tx" persona="system" preview={heading}>
      <H1>{heading}</H1>
      <P>{summary}</P>
      {fields.length > 0 && (
        <InfoBox tone="info">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {fields.map((f) => (
              <li key={f.label}>
                <strong>{f.label}:</strong> {f.value}
              </li>
            ))}
          </ul>
        </InfoBox>
      )}
      {actionUrl && <Button href={actionUrl}>{actionLabel || "Open the admin dashboard"}</Button>}
    </EmailShell>
  );
}

export const mock: AdminAlertProps = {
  heading: "New artist application",
  summary: "Maya Chen has applied to join Wallplace.",
  fields: [
    { label: "Email", value: "maya@example.com" },
    { label: "Location", value: "London" },
    { label: "Medium", value: "Oil on canvas" },
  ],
  actionUrl: "https://wallplace.co.uk/admin",
  actionLabel: "Review in the admin dashboard",
};

const entry: TemplateEntry<AdminAlertProps> = {
  id: "admin_alert",
  name: "Internal admin alert",
  description:
    "Generic operational notice to the Wallplace team. One template for every admin-facing alert; the caller supplies the heading and fields.",
  stream: "tx",
  persona: "system",
  category: "platform_admin",
  subject: "Wallplace admin alert",
  previewText: "An internal operational notice.",
  component: AdminAlert,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
