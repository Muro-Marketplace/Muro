// Stream: tx. To the ARTIST when the buyer confirms the order arrived.
//
// Row 874 / production pass 2. "The buyer's three templates fired
// (customer_order_processing, customer_order_out_for_delivery,
// customer_order_delivered) and the lifecycle events were recorded, but NO
// email and no bell reached the artist on any transition, including the one
// that released their £50.99 payout."
//
// That transition is the one worth an email. The other two are the artist's own
// clicks and telling them what they just did is noise; this one is somebody
// else's action, and it moves their money.
//
// Distinct from `artist_payout_sent`, which fires on Stripe's `payout.paid` and
// means the money has left Stripe for their bank. This one means the hold is
// over and the transfer has been released, which happens first.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistOrderDeliveredProps {
  firstName: string;
  orderNumber: string;
  orderUrl: string;
}

export function ArtistOrderDelivered({ firstName, orderNumber, orderUrl }: ArtistOrderDeliveredProps) {
  return (
    <EmailShell
      stream="tx"
      persona="artist"
      category="orders_and_payouts"
      preview={`Order ${orderNumber} arrived, your payout has been released`}
    >
      <H1>It arrived, and your payout is on its way</H1>
      <P>
        Hi {firstName}, the buyer has confirmed that order <strong>{orderNumber}</strong> arrived.
        Your share is released from its hold and heads to your Stripe account. You&rsquo;ll get a
        separate note when it lands in your bank.
      </P>
      <Button href={orderUrl} persona="artist">View the order</Button>
    </EmailShell>
  );
}

export const mock: ArtistOrderDeliveredProps = {
  firstName: "Maya",
  orderNumber: "WS-J6CRQS4XTX2DJRO7",
  orderUrl: "https://wallplace.co.uk/artist-portal/orders",
};

const entry: TemplateEntry<ArtistOrderDeliveredProps> = {
  id: "artist_order_delivered",
  name: "Order delivered (to artist)",
  description: "The buyer confirmed arrival, so the artist's payout hold is released.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Order {{orderNumber}} arrived, your payout is released",
  previewText: "The hold is over.",
  component: ArtistOrderDelivered,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
