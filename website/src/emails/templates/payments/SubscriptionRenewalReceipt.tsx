// ADDITION — recurring billing receipt (distinct from SubscriptionUpgraded).
// Stream: tx.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionRenewalReceiptProps {
  firstName: string;
  planName: string;
  amount: Money;
  renewedAt: string;
  nextBillingDate: string;
  invoiceUrl: string;
}

export function SubscriptionRenewalReceipt({ firstName, planName, amount, renewedAt, nextBillingDate, invoiceUrl }: SubscriptionRenewalReceiptProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Receipt for your ${planName} subscription`}>
      <H1>Thanks for staying with us</H1>
      <P>Hi {firstName} — we&rsquo;ve charged {formatMoney(amount)} for another period of {planName}, on {renewedAt}.</P>
      <P>Next billing date: <strong>{nextBillingDate}</strong>.</P>
      <Button href={invoiceUrl}>Download invoice</Button>
    </EmailShell>
  );
}

export const mock: SubscriptionRenewalReceiptProps = {
  firstName: "Maya",
  planName: "Premium",
  amount: { amount: 999, currency: "GBP" },
  renewedAt: "24 April 2026",
  nextBillingDate: "24 May 2026",
  invoiceUrl: "https://wallplace.co.uk/artist-portal/billing/invoices/latest.pdf",
};

const entry: TemplateEntry<SubscriptionRenewalReceiptProps> = {
  id: "subscription_renewal_receipt",
  name: "Subscription renewal receipt",
  description: "Recurring charge receipt for tax records.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Receipt for your {{planName}} subscription",
  previewText: "Keep for your records.",
  component: SubscriptionRenewalReceipt,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
