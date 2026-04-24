// Stream: tx. Arrival confirmation + light post-purchase prompt.

import { EmailShell, H1, P, Button, SecondaryButton } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerDeliveryConfirmationProps {
  firstName: string;
  orderNumber: string;
  deliveredAt: string;
  careGuideUrl: string;
  reviewUrl: string;
}

export function CustomerDeliveryConfirmation({ firstName, orderNumber, deliveredAt, careGuideUrl, reviewUrl }: CustomerDeliveryConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your order ${orderNumber} has arrived`}>
      <H1>It&rsquo;s arrived</H1>
      <P>Hi {firstName} — {orderNumber} was delivered {deliveredAt}. Hang it where the light is kind.</P>
      <div>
        <Button href={careGuideUrl} persona="customer">Care guide</Button>{" "}
        <SecondaryButton href={reviewUrl} persona="customer">Leave a review</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerDeliveryConfirmationProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  deliveredAt: "Tuesday, 28 April",
  careGuideUrl: "https://wallplace.co.uk/care",
  reviewUrl: "https://wallplace.co.uk/orders/WP-28473/review",
};

const entry: TemplateEntry<CustomerDeliveryConfirmationProps> = {
  id: "customer_delivery_confirmation",
  name: "Delivery confirmation",
  description: "Carrier-reported delivery — light prompt to review.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your order {{orderNumber}} has arrived",
  previewText: "Hang it where the light is kind.",
  component: CustomerDeliveryConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
