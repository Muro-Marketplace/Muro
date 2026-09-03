// Stream: tx (orders_and_payouts). To the BUYER when Stripe could not return
// their money (refund.failed).
//
// The buyer had already been told "refund on the way" by CustomerRefundConfirmation.
// When the refund then bounced, an operator was alerted and the buyer was left
// watching a card that never got its money back. This says plainly what
// happened and what happens next, and never asks for card details by email.

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

/**
 * Stripe's refund failure reasons, in the buyer's terms. Shared by the send
 * site and the mock so the two cannot drift.
 */
export function describeRefundFailure(reason: string | null | undefined): string {
  switch (reason) {
    case "lost_or_stolen_card":
      return "The card has been reported lost or stolen, so the bank will not accept a payment to it.";
    case "expired_or_canceled_card":
      return "The card has expired or been cancelled.";
    case "charge_for_pending_refund_disputed":
      return "The original payment is being disputed with the bank, which blocks a refund until that is settled.";
    case "insufficient_funds":
      return "The refund could not be funded at that moment.";
    case "declined":
      return "The bank declined the refund.";
    default:
      return "The bank did not give a reason.";
  }
}

export interface CustomerRefundFailedProps {
  firstName: string;
  orderNumber: string;
  refundAmount: Money;
  /** Plain English, from describeRefundFailure. */
  reasonText: string;
  supportUrl?: string;
}

export function CustomerRefundFailed({ firstName, orderNumber, refundAmount, reasonText, supportUrl }: CustomerRefundFailedProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your refund for order ${orderNumber} did not go through`}>
      <H1>Your refund for order {orderNumber} did not go through</H1>
      <P>
        Hi {firstName}, we recently told you a refund of <strong>{formatMoney(refundAmount)}</strong>{" "}
        for order {orderNumber} was on its way. We tried to send it back to the card you paid with
        and the payment could not be completed. {reasonText}
      </P>
      <InfoBox tone="warning">
        <strong>Your money is not lost.</strong> Our team has been alerted and will send the refund
        another way, usually within five working days.
      </InfoBox>
      <P>
        If the card you paid with has been cancelled or replaced, contact support and we will
        arrange a bank transfer instead. Please do not send card details by email.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CustomerRefundFailedProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  refundAmount: { amount: 24000, currency: "GBP" },
  reasonText: describeRefundFailure("expired_or_canceled_card"),
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerRefundFailedProps> = {
  id: "customer_refund_failed",
  name: "Refund failed (to customer)",
  description: "Stripe could not return the money to the buyer's card; what happened and what happens next.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your refund for order {{orderNumber}} did not go through",
  previewText: "Your money is not lost. Here is what happens next.",
  component: CustomerRefundFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
