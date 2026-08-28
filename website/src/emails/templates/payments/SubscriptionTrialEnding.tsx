// Stream: news (promotions). Fires at 3d + 1d before trial ends.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionTrialEndingProps {
  firstName: string;
  planName: string;
  trialEndDate: string;
  upgradeUrl: string;
  benefits: string[];
}

export function SubscriptionTrialEnding({ firstName, planName, trialEndDate, upgradeUrl, benefits }: SubscriptionTrialEndingProps) {
  return (
    <EmailShell stream="news" persona="multi" category="promotions" preview={`Your ${planName} trial ends ${trialEndDate}`}>
      <H1>Your trial ends {trialEndDate}</H1>
      <P>Hi {firstName}, you&rsquo;re using {planName}. Here&rsquo;s what you&rsquo;d lose when the trial ends:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {benefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Button href={upgradeUrl}>Continue with {planName}</Button>
    </EmailShell>
  );
}

export const mock: SubscriptionTrialEndingProps = {
  firstName: "Maya",
  planName: "Premium",
  trialEndDate: "28 April 2026",
  upgradeUrl: "https://wallplace.co.uk/artist-portal/billing",
  benefits: [
    "Unlimited works in your portfolio",
    "Priority matching with venues",
    "Advanced QR analytics",
  ],
};

const entry: TemplateEntry<SubscriptionTrialEndingProps> = {
  id: "subscription_trial_ending",
  name: "Trial ending",
  description: "Pre-expiry reminder with benefits list.",
  stream: "news",
  persona: "multi",
  // WS4.5 (audit R2.3/R4.1 Critical): this is the ONLY notice before the
  // first real charge. It sat in "promotions" (opt-in, default OFF,
  // suppressible, throttled), so anyone with a preferences row was charged
  // with no warning. Billing notices always send.
  category: "orders_and_payouts",
  subject: "Your {{planName}} trial ends {{trialEndDate}}",
  previewText: "Keep your upgrades?",
  component: SubscriptionTrialEnding,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
