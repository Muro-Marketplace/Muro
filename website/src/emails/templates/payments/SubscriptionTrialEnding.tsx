// Stream: tx (orders_and_payouts). Fires on customer.subscription.trial_will_end,
// three days before the first real charge.
//
// WS4.5 (audit R2.3/R4.1 Critical) moved the registry entry to
// orders_and_payouts, but the shell still declared stream="news" and the send
// site still passed "promotions": the only notice before a card is charged was
// opt-in, default off, suppressible and throttled, with a marketing unsubscribe
// in its footer. It is a billing notice now, end to end. The benefits list is
// the plan's own feature list (lib/plan-features) rather than three hand-written
// lines that had drifted from the pricing cards.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { planFeaturesFor } from "@/lib/plan-features";

export interface SubscriptionTrialEndingProps {
  firstName: string;
  planName: string;
  trialEndDate: string;
  upgradeUrl: string;
  /** What the plan includes. Send sites pass planFeaturesFor(plan). */
  benefits: string[];
  /** What the card is charged once the trial ends, when the send site knows it. */
  amount?: Money;
  billingInterval?: "month" | "year";
  supportUrl?: string;
}

export function SubscriptionTrialEnding({
  firstName,
  planName,
  trialEndDate,
  upgradeUrl,
  benefits,
  amount,
  billingInterval,
  supportUrl,
}: SubscriptionTrialEndingProps) {
  const per = billingInterval === "year" ? "a year" : "a month";
  return (
    <EmailShell stream="tx" persona="artist" preview={`Your ${planName} trial ends ${trialEndDate}`}>
      <H1>Your {planName} trial ends {trialEndDate}</H1>
      <P>
        Hi {firstName}, your free trial of Wallplace {planName} ends on <strong>{trialEndDate}</strong>.
        {amount
          ? ` From then your card is charged ${formatMoney(amount)} ${per} unless you cancel before that date.`
          : " From then your plan is charged to the card on your account unless you cancel before that date."}
      </P>
      <InfoBox tone="info">
        <strong>Nothing to do if you want to stay on {planName}.</strong>
        <div style={{ marginTop: 4 }}>
          To change your plan or cancel, use your billing page before {trialEndDate}. Cancel before
          then and nothing is charged.
        </div>
      </InfoBox>
      <P>Here is what {planName} includes:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {benefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Button href={upgradeUrl} persona="artist">Manage your subscription</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SubscriptionTrialEndingProps = {
  firstName: "Maya",
  planName: "Premium",
  trialEndDate: "28 April 2026",
  upgradeUrl: "https://wallplace.co.uk/artist-portal/billing",
  benefits: planFeaturesFor("premium"),
  amount: { amount: 2499, currency: "GBP" },
  billingInterval: "month",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<SubscriptionTrialEndingProps> = {
  id: "subscription_trial_ending",
  name: "Trial ending",
  description: "Billing notice three days before the first charge, with the plan's own feature list.",
  stream: "tx",
  persona: "artist",
  // WS4.5 (audit R2.3/R4.1 Critical): this is the ONLY notice before the
  // first real charge. It sat in "promotions" (opt-in, default OFF,
  // suppressible, throttled), so anyone with a preferences row was charged
  // with no warning. Billing notices always send.
  category: "orders_and_payouts",
  subject: "Your {{planName}} trial ends {{trialEndDate}}",
  previewText: "Your first payment is coming up. Here is what to expect.",
  component: SubscriptionTrialEnding,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
