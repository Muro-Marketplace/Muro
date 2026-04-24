// Stream: tx. Shipping confirmation — tracking details.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerShippingConfirmationProps {
  firstName: string;
  orderNumber: string;
  trackingUrl: string;
  carrier: string;
  estimatedDelivery: string;
  orderUrl: string;
}

export function CustomerShippingConfirmation({ firstName, orderNumber, trackingUrl, carrier, estimatedDelivery, orderUrl }: CustomerShippingConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your order ${orderNumber} is on its way`}>
      <H1>On its way</H1>
      <P>Hi {firstName} — {orderNumber} has shipped with {carrier}. Estimated arrival: <strong>{estimatedDelivery}</strong>.</P>
      <InfoBox tone="neutral">We&rsquo;ll email you again when it&rsquo;s delivered.</InfoBox>
      <Button href={trackingUrl} persona="customer">Track package</Button>
      <P style={{ marginTop: 16 }}>
        <a href={orderUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>View order</a>
      </P>
    </EmailShell>
  );
}

export const mock: CustomerShippingConfirmationProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  trackingUrl: "https://dpd.co.uk/track/WP28473",
  carrier: "DPD",
  estimatedDelivery: "Tuesday 28 April",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
};

const entry: TemplateEntry<CustomerShippingConfirmationProps> = {
  id: "customer_shipping_confirmation",
  name: "Shipping confirmation",
  description: "Tracking details after the artist marks as shipped.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your order {{orderNumber}} is on its way",
  previewText: "Tracking details inside.",
  component: CustomerShippingConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
