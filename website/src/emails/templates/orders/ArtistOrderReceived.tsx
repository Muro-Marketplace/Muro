// Stream: tx. Phase 2.0c. Artist's notification that a new order has
// been placed. Counterpart to CustomerOrderPlaced. This is the
// purpose-built lifecycle template that the J1 dispatcher binds to
// `order.placed`. ArtistOrderConfirmation remains for the legacy
// receipt path until Phase 3.

import { EmailShell, H1, P, Button, Small, Divider } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";
import { SUPPORT_EMAIL } from "@/lib/email/constants";

export interface ArtistOrderReceivedProps {
  firstName: string;
  orderNumber: string;
  workTitle: string;
  buyerFirstName: string;
  orderUrl: string;
  workImage?: string;
  nextSteps?: string[];
}

export function ArtistOrderReceived({
  firstName,
  orderNumber,
  workTitle,
  buyerFirstName,
  orderUrl,
  workImage,
  nextSteps,
}: ArtistOrderReceivedProps) {
  const steps = nextSteps ?? [
    "Pack the piece securely",
    "Mark the order as shipped in the portal",
    "Payout lands 2 business days after delivery is confirmed",
  ];
  return (
    <EmailShell stream="tx" persona="artist" preview={`New order ${orderNumber}, ${workTitle}`}>
      <H1>New order: {orderNumber}</H1>
      <P>Hi {firstName}, {buyerFirstName} just bought <strong>{workTitle}</strong>.</P>
      {workImage && (
        <div style={{ margin: "16px 0" }}>
          <Img src={workImage} alt={workTitle} width={120} height={120} style={{ display: "block", borderRadius: 4, objectFit: "cover" as const }} />
        </div>
      )}
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <Button href={orderUrl} persona="artist">Open order</Button>
      <Divider />
      <Small>Questions? Email {SUPPORT_EMAIL}.</Small>
    </EmailShell>
  );
}

export const mock: ArtistOrderReceivedProps = {
  firstName: "Maya",
  orderNumber: "WP-28473",
  workTitle: "Last Light on Mare Street",
  buyerFirstName: "Oliver",
  orderUrl: "https://wallplace.co.uk/artist-portal/orders/WP-28473",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
};

const entry: TemplateEntry<ArtistOrderReceivedProps> = {
  id: "artist_order_received",
  name: "Artist: order received",
  description: "New-order notification for the artist (Phase 2 lifecycle).",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "New order {{orderNumber}}, {{workTitle}}",
  previewText: "A new order is waiting.",
  component: ArtistOrderReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
