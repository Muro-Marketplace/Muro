// Stream: tx. Dispute opened — both parties + support cc'd (bcc at send time).

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OrderDisputeOpenedProps {
  firstName: string;
  orderNumber: string;
  disputeUrl: string;
  nextSteps: string[];
  supportUrl?: string;
}

export function OrderDisputeOpened({ firstName, orderNumber, disputeUrl, nextSteps, supportUrl }: OrderDisputeOpenedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Dispute opened on order ${orderNumber}`}>
      <H1>Dispute opened on {orderNumber}</H1>
      <P>Hi {firstName} — a dispute has been raised on this order. We&rsquo;ll handle the moderation and keep you both updated.</P>
      <InfoBox tone="warning">
        <strong>What happens next</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {nextSteps.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </InfoBox>
      <Button href={disputeUrl}>View dispute</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OrderDisputeOpenedProps = {
  firstName: "Maya",
  orderNumber: "WP-28473",
  disputeUrl: "https://wallplace.co.uk/orders/WP-28473/dispute",
  nextSteps: [
    "Reply within 3 business days with your perspective and any photos",
    "We&rsquo;ll hold the payout while the case is open",
    "If unresolved, we&rsquo;ll make a final call and refund / release accordingly",
  ],
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OrderDisputeOpenedProps> = {
  id: "order_dispute_opened",
  name: "Order dispute opened",
  description: "Sent to both parties when a dispute is raised.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "Dispute opened on order {{orderNumber}}",
  previewText: "Please reply within 3 business days.",
  component: OrderDisputeOpened,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
