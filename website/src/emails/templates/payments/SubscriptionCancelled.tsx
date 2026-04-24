// Stream: tx. Cancellation confirmation + reactivate path.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionCancelledProps {
  firstName: string;
  planName: string;
  accessEndsAt: string;
  reactivateUrl: string;
  supportUrl?: string;
}

export function SubscriptionCancelled({ firstName, planName, accessEndsAt, reactivateUrl, supportUrl }: SubscriptionCancelledProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Your ${planName} plan will end ${accessEndsAt}`}>
      <H1>Subscription cancelled</H1>
      <P>Hi {firstName} — your {planName} subscription is scheduled to end on <strong>{accessEndsAt}</strong>. You&rsquo;ll keep full access until then.</P>
      <P>If you change your mind:</P>
      <Button href={reactivateUrl}>Reactivate</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SubscriptionCancelledProps = {
  firstName: "Maya",
  planName: "Premium",
  accessEndsAt: "24 May 2026",
  reactivateUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<SubscriptionCancelledProps> = {
  id: "subscription_cancelled",
  name: "Subscription cancelled",
  description: "Confirmation with reactivate path.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Your {{planName}} subscription is cancelled",
  previewText: "You're covered until the period ends.",
  component: SubscriptionCancelled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
