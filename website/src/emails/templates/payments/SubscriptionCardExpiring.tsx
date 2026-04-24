// ADDITION — 30-day pre-warning so `payment_failed` dunning is rarer.
// Stream: tx.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionCardExpiringProps {
  firstName: string;
  last4: string;
  expiresAt: string;
  updatePaymentUrl: string;
}

export function SubscriptionCardExpiring({ firstName, last4, expiresAt, updatePaymentUrl }: SubscriptionCardExpiringProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Card ending ${last4} expires soon`}>
      <H1>Your card is expiring</H1>
      <P>Hi {firstName} — the card ending in <strong>{last4}</strong> expires on <strong>{expiresAt}</strong>. Update it now so your subscription keeps running.</P>
      <InfoBox tone="warning">We&rsquo;ll start the dunning flow if the renewal fails, so best to update before then.</InfoBox>
      <Button href={updatePaymentUrl}>Update payment method</Button>
    </EmailShell>
  );
}

export const mock: SubscriptionCardExpiringProps = {
  firstName: "Maya",
  last4: "4242",
  expiresAt: "May 2026",
  updatePaymentUrl: "https://wallplace.co.uk/artist-portal/billing",
};

const entry: TemplateEntry<SubscriptionCardExpiringProps> = {
  id: "subscription_card_expiring",
  name: "Card expiring",
  description: "30-day pre-warning before card expires.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Card ending {{last4}} expires soon",
  previewText: "Update before renewal to avoid interruption.",
  component: SubscriptionCardExpiring,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
