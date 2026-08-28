// Stream: tx. Tells the buyer a deferred payment failed after checkout.
//
// WS1.5 (audit R1 unhandled list): with a delayed payment method (bank
// debits and similar), checkout completes before the money moves. When the
// payment then fails, the settlement gate has correctly booked nothing, but
// the buyer walked away believing they bought art. Nothing was charged and
// no order exists; this says so, and invites them to try again.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerPaymentFailedProps {
  firstName: string;
  browseUrl: string;
  supportUrl?: string;
}

export function CustomerPaymentFailed({ firstName, browseUrl, supportUrl }: CustomerPaymentFailedProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview="Your payment did not go through">
      <H1>Your payment did not go through, {firstName}</H1>
      <P>
        The payment for your recent Wallplace checkout failed after your bank processed it.
        Nothing has been charged and no order was created, so there is nothing to cancel.
      </P>
      <InfoBox tone="warning">
        The artwork was not reserved. If you would still like it, place the order again with
        another payment method.
      </InfoBox>
      <Button href={browseUrl}>Return to Wallplace</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CustomerPaymentFailedProps = {
  firstName: "Jo",
  browseUrl: "https://wallplace.co.uk/browse",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerPaymentFailedProps> = {
  id: "customer_payment_failed",
  name: "Customer: payment failed",
  description: "A deferred (bank) payment failed after checkout; nothing was charged or booked.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your Wallplace payment did not go through",
  previewText: "Nothing was charged and no order was created.",
  component: CustomerPaymentFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
