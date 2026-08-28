// Stream: tx. A refund request was declined. The counterpart to
// CustomerRefundConfirmation, which is sent when one is approved.
//
// K1: notifyRefundDecision handled both outcomes in one hand-written HTML
// function with an `approved` boolean. The approved half already went through
// the pipeline as CustomerRefundConfirmation; only the decline had no template,
// which is why the legacy function survived.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerRefundRejectedProps {
  firstName: string;
  orderNumber: string;
  reason?: string;
  ordersUrl: string;
  supportUrl?: string;
}

export function CustomerRefundRejected({
  firstName,
  orderNumber,
  reason,
  ordersUrl,
  supportUrl,
}: CustomerRefundRejectedProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Refund decision for order ${orderNumber}`}>
      <H1>We could not approve this refund</H1>
      <P>
        Hi {firstName}, your refund request for order {orderNumber} has not been approved, so no
        money has been returned.
      </P>
      {reason && (
        <InfoBox tone="neutral">
          <strong>Reason given:</strong> {reason}
        </InfoBox>
      )}
      <P>
        If you think this is wrong, reply to this email or contact support and a person will look
        at it again.
      </P>
      <Button href={ordersUrl} persona="customer">View your orders</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CustomerRefundRejectedProps = {
  firstName: "Sam",
  orderNumber: "WP-4821",
  reason: "The return window for this order closed on 14 May.",
  ordersUrl: "https://wallplace.co.uk/customer-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerRefundRejectedProps> = {
  id: "customer_refund_rejected",
  name: "Refund declined (to customer)",
  description: "A refund request was not approved; no money has moved.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Refund decision for order {{orderNumber}}",
  previewText: "We could not approve this refund.",
  component: CustomerRefundRejected,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
