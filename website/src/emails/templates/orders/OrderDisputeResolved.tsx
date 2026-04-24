// Stream: tx. Dispute resolution — outcome stated clearly.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OrderDisputeResolvedProps {
  firstName: string;
  orderNumber: string;
  outcome: string;
  disputeUrl: string;
  supportUrl?: string;
}

export function OrderDisputeResolved({ firstName, orderNumber, outcome, disputeUrl, supportUrl }: OrderDisputeResolvedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Dispute on ${orderNumber} resolved`}>
      <H1>Dispute resolved</H1>
      <P>Hi {firstName} — the dispute on order {orderNumber} is closed.</P>
      <InfoBox tone="neutral">
        <strong>Outcome:</strong> {outcome}
      </InfoBox>
      <Button href={disputeUrl}>View final decision</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OrderDisputeResolvedProps = {
  firstName: "Maya",
  orderNumber: "WP-28473",
  outcome: "Full refund to the buyer; replacement piece shipped by the artist at our cost.",
  disputeUrl: "https://wallplace.co.uk/orders/WP-28473/dispute",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OrderDisputeResolvedProps> = {
  id: "order_dispute_resolved",
  name: "Order dispute resolved",
  description: "Final decision on a disputed order.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Dispute on {{orderNumber}} resolved",
  previewText: "Final outcome inside.",
  component: OrderDisputeResolved,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
