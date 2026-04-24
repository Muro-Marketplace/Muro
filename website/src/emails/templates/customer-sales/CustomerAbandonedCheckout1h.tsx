// Stream: news. 1h after abandoned checkout.

import { EmailShell, H1, P, Button, OrderSummary, Small } from "@/emails/_components";
import type { Money, OrderItem } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockOrderItems } from "@/emails/data/mockData";

export interface CustomerAbandonedCheckout1hProps {
  firstName: string;
  cartItems: OrderItem[];
  subtotal: Money;
  checkoutUrl: string;
  supportUrl?: string;
}

export function CustomerAbandonedCheckout1h({ firstName, cartItems, subtotal, checkoutUrl }: CustomerAbandonedCheckout1hProps) {
  return (
    <EmailShell stream="news" persona="customer" category="promotions" preview="Left something behind?">
      <H1>Left something behind?</H1>
      <P>Hi {firstName} — we&rsquo;ve held your cart. Carry on whenever you&rsquo;re ready.</P>
      <OrderSummary items={cartItems} subtotal={subtotal} shipping={{ amount: 0, currency: "GBP" }} total={subtotal} />
      <div style={{ marginTop: 20 }}>
        <Button href={checkoutUrl} persona="customer">Continue checkout</Button>
      </div>
      <Small>Stock is live — popular pieces can sell before you&rsquo;re back.</Small>
    </EmailShell>
  );
}

export const mock: CustomerAbandonedCheckout1hProps = {
  firstName: "Oliver",
  cartItems: mockOrderItems,
  subtotal: { amount: 66000, currency: "GBP" },
  checkoutUrl: "https://wallplace.co.uk/checkout?resume=example",
};

const entry: TemplateEntry<CustomerAbandonedCheckout1hProps> = {
  id: "customer_abandoned_checkout_1h",
  name: "Abandoned checkout — 1h",
  description: "First gentle reminder an hour after abandonment.",
  stream: "news",
  persona: "customer",
  category: "promotions",
  subject: "Left something behind?",
  previewText: "Your cart is held.",
  component: CustomerAbandonedCheckout1h,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
