// Stream: tx. Dunning email — fires at +0 / +3d / +7d / +10d with retry date.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionPaymentFailedProps {
  firstName: string;
  planName: string;
  amountDue: Money;
  retryDate: string;
  updatePaymentUrl: string;
  supportUrl?: string;
}

export function SubscriptionPaymentFailed({ firstName, planName, amountDue, retryDate, updatePaymentUrl, supportUrl }: SubscriptionPaymentFailedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Payment failed on your ${planName} subscription`}>
      <H1>Payment failed</H1>
      <P>Hi {firstName} — we couldn&rsquo;t charge your payment method for the {planName} subscription ({formatMoney(amountDue)}).</P>
      <InfoBox tone="warning">
        We&rsquo;ll retry on <strong>{retryDate}</strong>. Update your card before then to avoid losing access.
      </InfoBox>
      <Button href={updatePaymentUrl}>Update payment method</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SubscriptionPaymentFailedProps = {
  firstName: "Maya",
  planName: "Wallplace Premium",
  amountDue: { amount: 999, currency: "GBP" },
  retryDate: "28 April 2026",
  updatePaymentUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<SubscriptionPaymentFailedProps> = {
  id: "subscription_payment_failed",
  name: "Subscription payment failed",
  description: "Dunning email — multiple retries.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Payment failed on your {{planName}} subscription",
  previewText: "Update your card to avoid losing access.",
  component: SubscriptionPaymentFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
