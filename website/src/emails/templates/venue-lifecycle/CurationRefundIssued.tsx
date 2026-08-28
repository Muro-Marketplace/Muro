// Stream: tx. Confirms a curation refund has been issued (04 D18).
//
// The counterpart to CurationPaymentReceived: money left, money returned. Sent
// by the admin refund endpoint, keyed on the request id so a retried click
// cannot double it. For managed tiers the same message also confirms the
// subscription is cancelled, so the venue is not left wondering whether the
// next invoice is still coming.

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CurationRefundIssuedProps {
  contactFirstName: string;
  venueName: string;
  tierLabel: string;
  amount: Money;
  subscriptionCancelled: boolean;
  supportUrl?: string;
}

export function CurationRefundIssued({
  contactFirstName,
  venueName,
  tierLabel,
  amount,
  subscriptionCancelled,
  supportUrl,
}: CurationRefundIssuedProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview="Your curation payment has been refunded">
      <H1>Your refund is on its way, {contactFirstName}</H1>
      <P>We have refunded your curation payment for {venueName}.</P>
      <InfoBox tone="info">
        <strong>Refunded:</strong> {formatMoney(amount)}
        <br />
        <strong>Service:</strong> {tierLabel}
        <br />
        <strong>Venue:</strong> {venueName}
      </InfoBox>
      {subscriptionCancelled && (
        <P>Your managed curation subscription has been cancelled, so no further payments will be taken.</P>
      )}
      <P>
        The money goes back to the card you paid with. Most banks show it within 5 to 10
        business days.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationRefundIssuedProps = {
  contactFirstName: "Sam",
  venueName: "The Copper Kettle",
  tierLabel: "Managed curation",
  amount: { amount: 49900, currency: "GBP" },
  subscriptionCancelled: true,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationRefundIssuedProps> = {
  id: "curation_refund_issued",
  name: "Curation refund issued",
  description: "Confirms a curation refund and, for managed tiers, the cancelled subscription.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace curation payment has been refunded",
  previewText: "Your refund is on its way back to your card.",
  component: CurationRefundIssued,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
