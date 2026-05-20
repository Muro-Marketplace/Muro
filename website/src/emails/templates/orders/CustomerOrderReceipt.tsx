// Stream: tx (legal, CCR 2013 requires a receipt). Never suppressible.

import { EmailShell, H1, P, Button, OrderSummary, AddressBlock, Divider, Small, SupportBlock } from "@/emails/_components";
import type { Address, Money, OrderItem } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockAddress, mockOrderItems } from "@/emails/data/mockData";

export interface CustomerOrderReceiptProps {
  firstName: string;
  orderNumber: string;
  orderUrl: string;
  orderDate: string;
  items: OrderItem[];
  subtotal: Money;
  shipping: Money;
  tax?: Money;
  total: Money;
  billingAddress: Address;
  shippingAddress: Address;
  supportUrl?: string;
  /** HMAC token bound to {orderId, email}. When present the
   *  /orders/track link auto-authenticates the lookup. */
  trackingToken?: string;
}

export function CustomerOrderReceipt(p: CustomerOrderReceiptProps) {
  // Plan F #17: when the webhook mints a tracking token, route the
  // primary 'View order' button through /orders/track?t=... so the
  // buyer lands directly on their order without needing to sign in.
  // Without the token (legacy / token-secret missing) we fall back to
  // the sign-in-required orderUrl so the button still works for
  // signed-in customers.
  const primaryHref = p.trackingToken
    ? `https://wallplace.co.uk/orders/track?t=${encodeURIComponent(p.trackingToken)}`
    : p.orderUrl;
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your Wallplace order ${p.orderNumber}`}>
      <H1>Thanks, {p.firstName}</H1>
      <P>Your order <strong>{p.orderNumber}</strong> is confirmed. Receipt below, keep this email for your records.</P>
      <OrderSummary items={p.items} subtotal={p.subtotal} shipping={p.shipping} tax={p.tax} total={p.total} />
      <Divider />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
        <AddressBlock label="Billing" address={p.billingAddress} />
        <AddressBlock label="Shipping" address={p.shippingAddress} />
      </div>
      <Button href={primaryHref} persona="customer">Track your order</Button>
      <Small>Ordered {p.orderDate}.</Small>
      {!p.trackingToken && (
        <Small>
          Don&rsquo;t have a Wallplace account? Track this order any time at{" "}
          <a
            href="https://wallplace.co.uk/orders/track"
            style={{ color: "#9b6b3f" }}
          >
            wallplace.co.uk/orders/track
          </a>
          {" "}using order ID <strong>{p.orderNumber}</strong>.
        </Small>
      )}
      <SupportBlock supportUrl={p.supportUrl} />
    </EmailShell>
  );
}

export const mock: CustomerOrderReceiptProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  orderDate: "24 April 2026",
  items: mockOrderItems,
  subtotal: { amount: 66000, currency: "GBP" },
  shipping: { amount: 1200, currency: "GBP" },
  tax: { amount: 13440, currency: "GBP" },
  total: { amount: 80640, currency: "GBP" },
  billingAddress: mockAddress,
  shippingAddress: mockAddress,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerOrderReceiptProps> = {
  id: "customer_order_receipt",
  name: "Order receipt",
  description: "Legal order confirmation / VAT receipt.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your Wallplace order {{orderNumber}}",
  previewText: "Receipt attached.",
  component: CustomerOrderReceipt,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
