// Stream: tx (orders_and_payouts). To the ARTIST when an order has passed its
// payout date without being marked shipped (stripe-connect.ts, WS2.6 hold).
//
// The hold itself is right: a payout for a piece that never left the studio is
// the platform's chargeback exposure. But the hold alerted an operator and
// nobody else, so the one person who could clear it, by shipping or by
// cancelling, was the one person not told.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistOrderUnshippedPayoutHeldProps {
  firstName: string;
  orderNumber: string;
  payoutAmount: Money;
  ordersUrl: string;
  supportUrl?: string;
}

export function ArtistOrderUnshippedPayoutHeld({
  firstName,
  orderNumber,
  payoutAmount,
  ordersUrl,
  supportUrl,
}: ArtistOrderUnshippedPayoutHeldProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Order ${orderNumber} needs to ship before we can pay you`}>
      <H1>Order {orderNumber} needs to ship before we can pay you</H1>
      <P>
        Hi {firstName}, order <strong>{orderNumber}</strong> has reached its payout date but has
        not been marked as shipped, so your {formatMoney(payoutAmount)} payout is on hold.
      </P>
      <InfoBox tone="info">
        Once the piece is on its way, mark the order as shipped from your orders page. The payout
        is released automatically when the buyer confirms delivery, or after the usual hold if
        they do not.
      </InfoBox>
      <P>
        If you cannot fulfil this order, cancel it from the same page so the buyer is refunded, or
        contact support if something is stopping you.
      </P>
      <Button href={ordersUrl} persona="artist">Open your orders</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistOrderUnshippedPayoutHeldProps = {
  firstName: "Maya",
  orderNumber: "WS-J6CRQS4XTX2DJRO7",
  payoutAmount: { amount: 21600, currency: "GBP" },
  ordersUrl: "https://wallplace.co.uk/artist-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistOrderUnshippedPayoutHeldProps> = {
  id: "artist_order_unshipped_payout_held",
  name: "Unshipped order, payout held (to artist)",
  description: "The payout date passed without a shipment, so the artist's payout is on hold until they ship or cancel.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Order {{orderNumber}} needs to ship before we can pay you",
  previewText: "Your payout is on hold until the order ships.",
  component: ArtistOrderUnshippedPayoutHeld,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
