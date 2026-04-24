// Stream: tx. Confirms plan change.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionUpgradedProps {
  firstName: string;
  oldPlan: string;
  newPlan: string;
  billingDate: string;
  accountUrl: string;
}

export function SubscriptionUpgraded({ firstName, oldPlan, newPlan, billingDate, accountUrl }: SubscriptionUpgradedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`You're now on ${newPlan}`}>
      <H1>You&rsquo;re on {newPlan}</H1>
      <P>Hi {firstName} — you moved from {oldPlan} to {newPlan}. Your next billing date is <strong>{billingDate}</strong>.</P>
      <Button href={accountUrl}>Manage subscription</Button>
    </EmailShell>
  );
}

export const mock: SubscriptionUpgradedProps = {
  firstName: "Maya",
  oldPlan: "Core",
  newPlan: "Premium",
  billingDate: "24 May 2026",
  accountUrl: "https://wallplace.co.uk/artist-portal/billing",
};

const entry: TemplateEntry<SubscriptionUpgradedProps> = {
  id: "subscription_upgraded",
  name: "Subscription upgraded",
  description: "Plan change confirmation.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "You're now on {{newPlan}}",
  previewText: "Welcome to your new plan.",
  component: SubscriptionUpgraded,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
