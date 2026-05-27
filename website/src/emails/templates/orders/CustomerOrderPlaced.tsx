// Stream: tx. Phase 2.0c. Customer-facing order placed confirmation.
// Counterpart to ArtistOrderReceived. Binds to `order.placed` from the
// J1 dispatcher. CustomerOrderReceipt remains as the legacy VAT-style
// receipt; the new template is purpose-built for the lifecycle stepper.

import { EmailShell, H1, P, Button, Small, OrderSummary, AddressBlock, Divider } from "@/emails/_components";
import type { Address, Money, OrderItem } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockAddress, mockOrderItems } from "@/emails/data/mockData";
import { CONSUMER_RIGHTS_FOOTER, SUPPORT_URL } from "@/lib/email/constants";

export interface CustomerOrderPlacedProps {
  firstName: string;
  orderNumber: string;
  orderUrl: string;
  orderDate: string;
  items: OrderItem[];
  subtotal: Money;
  shipping: Money;
  tax?: Money;
  total: Money;
  shippingAddress: Address;
  trackingToken?: string;
}

export function CustomerOrderPlaced(p: CustomerOrderPlacedProps) {
  const primaryHref = p.trackingToken
    ? `https://wallplace.co.uk/orders/track?t=${encodeURIComponent(p.trackingToken)}`
    : p.orderUrl;
  return (
    <EmailShell stream="tx" persona="customer" preview={`Order ${p.orderNumber} confirmed`}>
      <H1>Order confirmed</H1>
      <P>
        Thanks, {p.firstName}. Order <strong>{p.orderNumber}</strong> is in. The artist
        has been notified and we&rsquo;ll email you again when they mark it as packed.
      </P>
      <OrderSummary items={p.items} subtotal={p.subtotal} shipping={p.shipping} tax={p.tax} total={p.total} />
      <Divider />
      <AddressBlock label="Shipping to" address={p.shippingAddress} />
      <Button href={primaryHref} persona="customer">Track order</Button>
      <Small>Placed {p.orderDate}.</Small>
      <Divider />
      <Small>{CONSUMER_RIGHTS_FOOTER}</Small>
      <Small>
        Need help? <a href={SUPPORT_URL} style={{ color: "#9b6b3f" }}>Contact us</a>.
      </Small>
    </EmailShell>
  );
}

export const mock: CustomerOrderPlacedProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  orderDate: "24 April 2026",
  items: mockOrderItems,
  subtotal: { amount: 66000, currency: "GBP" },
  shipping: { amount: 1200, currency: "GBP" },
  tax: { amount: 13440, currency: "GBP" },
  total: { amount: 80640, currency: "GBP" },
  shippingAddress: mockAddress,
};

const entry: TemplateEntry<CustomerOrderPlacedProps> = {
  id: "customer_order_placed",
  name: "Customer: order placed",
  description: "Lifecycle confirmation for a new order (Phase 2).",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Order {{orderNumber}} confirmed",
  previewText: "We've passed your order to the artist.",
  component: CustomerOrderPlaced,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
