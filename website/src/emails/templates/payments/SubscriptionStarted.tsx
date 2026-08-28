// Stream: tx. The first email of a paid subscription.
//
// 09 §D.5. Six `subscription_*` templates were registered and five were wired.
// There was no "started", so the one moment an artist most wants a written
// record — the moment they begin paying — produced nothing. The comment on the
// invoice.paid branch said the signup invoice was "covered by
// subscription_created or the checkout receipt", and neither existed.

import { EmailShell, H1, P, Small, Button, InfoBox } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionStartedProps {
  firstName: string;
  planName: string;
  amount: Money;
  billingInterval: "month" | "year";
  firstBillingDate: string;
  nextBillingDate: string;
  trialEndsAt?: string;
  manageUrl: string;
  invoiceUrl?: string;
}

export function SubscriptionStarted({
  firstName,
  planName,
  amount,
  billingInterval,
  firstBillingDate,
  nextBillingDate,
  trialEndsAt,
  manageUrl,
  invoiceUrl,
}: SubscriptionStartedProps) {
  const per = billingInterval === "year" ? "a year" : "a month";
  return (
    <EmailShell stream="tx" persona="artist" preview={`You're on Wallplace ${planName}`}>
      <H1>You&rsquo;re on {planName}</H1>
      <P>
        Hi {firstName}, your {planName} subscription is live. It&rsquo;s {formatMoney(amount)} {per},
        and you can change or cancel it whenever you like.
      </P>
      {trialEndsAt ? (
        <InfoBox tone="info">
          <strong>Your trial runs until {trialEndsAt}</strong>
          <div style={{ marginTop: 4 }}>
            Nothing is charged before then. The first payment is on {firstBillingDate}.
          </div>
        </InfoBox>
      ) : (
        <InfoBox tone="info">
          <strong>First payment: {firstBillingDate}</strong>
          <div style={{ marginTop: 4 }}>Next one after that: {nextBillingDate}.</div>
        </InfoBox>
      )}
      <Button href={manageUrl}>Manage your subscription</Button>
      {invoiceUrl ? (
        <P>
          <Small>
            Your invoice is at <a href={invoiceUrl}>{invoiceUrl}</a>, and every future one lands in
            your billing page.
          </Small>
        </P>
      ) : null}
    </EmailShell>
  );
}

export const mock: SubscriptionStartedProps = {
  firstName: "Maya",
  planName: "Premium",
  amount: { amount: 999, currency: "GBP" },
  billingInterval: "month",
  firstBillingDate: "24 May 2026",
  nextBillingDate: "24 June 2026",
  manageUrl: "https://wallplace.co.uk/artist-portal/billing",
  invoiceUrl: "https://wallplace.co.uk/artist-portal/billing/invoices/latest.pdf",
};

const entry: TemplateEntry<SubscriptionStartedProps> = {
  id: "subscription_started",
  name: "Subscription started",
  description: "First email of a paid plan, sent on customer.subscription.created.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "You're on Wallplace {{planName}}",
  previewText: "Your subscription is live. Here's what happens next.",
  component: SubscriptionStarted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
