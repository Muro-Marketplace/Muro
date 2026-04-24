// Stream: news. 24h after abandoned checkout — with an artist note if available.

import { EmailShell, H1, P, Button, QuoteBlock, OrderSummary } from "@/emails/_components";
import type { Money, OrderItem } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockOrderItems } from "@/emails/data/mockData";

export interface CustomerAbandonedCheckout24hProps {
  firstName: string;
  cartItems: OrderItem[];
  subtotal: Money;
  checkoutUrl: string;
  artistNote?: string;
  artistName?: string;
}

export function CustomerAbandonedCheckout24h({ firstName, cartItems, subtotal, checkoutUrl, artistNote, artistName }: CustomerAbandonedCheckout24hProps) {
  return (
    <EmailShell stream="news" persona="customer" category="promotions" preview="A note from the artist">
      <H1>{artistName ? `A note from ${artistName}` : "Still thinking?"}</H1>
      <P>Hi {firstName} — your cart is still here.</P>
      {artistNote && <QuoteBlock attribution={artistName}>{artistNote}</QuoteBlock>}
      <OrderSummary items={cartItems} subtotal={subtotal} shipping={{ amount: 0, currency: "GBP" }} total={subtotal} />
      <div style={{ marginTop: 20 }}>
        <Button href={checkoutUrl} persona="customer">Finish checkout</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerAbandonedCheckout24hProps = {
  firstName: "Oliver",
  cartItems: mockOrderItems,
  subtotal: { amount: 66000, currency: "GBP" },
  checkoutUrl: "https://wallplace.co.uk/checkout?resume=example",
  artistNote: "If it's the shipping that's giving you pause — I'll cover it. Just reply and I'll sort it.",
  artistName: "Maya Chen",
};

const entry: TemplateEntry<CustomerAbandonedCheckout24hProps> = {
  id: "customer_abandoned_checkout_24h",
  name: "Abandoned checkout — 24h",
  description: "Second reminder with artist note.",
  stream: "news",
  persona: "customer",
  category: "promotions",
  subject: "A note on your cart",
  previewText: "From the artist.",
  component: CustomerAbandonedCheckout24h,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
