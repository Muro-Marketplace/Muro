// Stream: tx. Operational receipt — artist's copy of a customer purchase.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistOrderConfirmationProps {
  firstName: string;
  orderNumber: string;
  workTitle: string;
  buyerFirstName: string;
  orderUrl: string;
  nextSteps: string[];
}

export function ArtistOrderConfirmation({ firstName, orderNumber, workTitle, buyerFirstName, orderUrl, nextSteps }: ArtistOrderConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Order ${orderNumber} — ${workTitle}`}>
      <H1>Order {orderNumber}</H1>
      <P>Hi {firstName} — {buyerFirstName} just ordered <strong>{workTitle}</strong>.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {nextSteps.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <Button href={orderUrl} persona="artist">Open order</Button>
    </EmailShell>
  );
}

export const mock: ArtistOrderConfirmationProps = {
  firstName: "Maya",
  orderNumber: "WP-28473",
  workTitle: "Last Light on Mare Street",
  buyerFirstName: "Oliver",
  orderUrl: "https://wallplace.co.uk/artist-portal/orders/WP-28473",
  nextSteps: ["Ship within 3 business days", "Mark as shipped in the portal", "Payout lands 2 business days after delivery"],
};

const entry: TemplateEntry<ArtistOrderConfirmationProps> = {
  id: "artist_order_confirmation",
  name: "Artist: order confirmation",
  description: "Artist's operational receipt for a customer order.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Order {{orderNumber}} — {{workTitle}}",
  previewText: "Ship within 3 business days.",
  component: ArtistOrderConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
