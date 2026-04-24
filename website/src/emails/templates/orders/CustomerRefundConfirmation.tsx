// Stream: tx. Refund confirmation to customer.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerRefundConfirmationProps {
  firstName: string;
  orderNumber: string;
  refundAmount: Money;
  refundReason?: string;
  expectedArrival: string;
  supportUrl?: string;
}

export function CustomerRefundConfirmation({ firstName, orderNumber, refundAmount, refundReason, expectedArrival, supportUrl }: CustomerRefundConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Refund for order ${orderNumber}`}>
      <H1>Refund on the way</H1>
      <P>Hi {firstName} — we&rsquo;ve refunded <strong>{formatMoney(refundAmount)}</strong> to your original payment method for order {orderNumber}.</P>
      <InfoBox tone="neutral">
        Expected to arrive by <strong>{expectedArrival}</strong>.
        {refundReason ? <><br />Reason: {refundReason}.</> : null}
      </InfoBox>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CustomerRefundConfirmationProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  refundAmount: { amount: 24000, currency: "GBP" },
  refundReason: "Piece arrived damaged",
  expectedArrival: "1 May 2026",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerRefundConfirmationProps> = {
  id: "customer_refund_confirmation",
  name: "Refund confirmation",
  description: "Customer refund processed.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Refund on the way for order {{orderNumber}}",
  previewText: "Amount and timing inside.",
  component: CustomerRefundConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
