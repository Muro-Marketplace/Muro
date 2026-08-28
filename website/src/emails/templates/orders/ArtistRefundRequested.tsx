// Stream: tx. A buyer has ASKED for a refund on the artist's sale. Distinct from
// ArtistRefundNotification, which tells them one has already been issued.
//
// K1: notifyRefundRequested sent this as hand-written HTML, and sent an admin
// copy from the same function. The two audiences are split now: the admin half
// is a sendAdminAlert (it needs a decision), this half is the artist's own
// notice. Reusing the past-tense "refund issued" template here would have told
// the artist money had moved when it had not.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistRefundRequestedProps {
  firstName: string;
  orderNumber: string;
  requesterName: string;
  refundAmount: Money;
  isFullRefund: boolean;
  reason?: string;
  ordersUrl: string;
  supportUrl?: string;
}

export function ArtistRefundRequested({
  firstName,
  orderNumber,
  requesterName,
  refundAmount,
  isFullRefund,
  reason,
  ordersUrl,
  supportUrl,
}: ArtistRefundRequestedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Refund requested on order ${orderNumber}`}>
      <H1>Refund requested on order {orderNumber}</H1>
      <P>
        Hi {firstName}, {requesterName} has asked for a refund. Nothing has been refunded yet.
      </P>
      <InfoBox tone="warning">
        <strong>Order:</strong> {orderNumber}
        <br />
        <strong>Type:</strong>{" "}
        {isFullRefund ? "Full refund" : `Partial refund, ${formatMoney(refundAmount)}`}
        {reason ? (
          <>
            <br />
            <strong>Reason:</strong> {reason}
          </>
        ) : null}
      </InfoBox>
      <Button href={ordersUrl} persona="artist">Review the request</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistRefundRequestedProps = {
  firstName: "Maya",
  orderNumber: "WP-4821",
  requesterName: "sam@example.com",
  refundAmount: { amount: 12000, currency: "GBP" },
  isFullRefund: false,
  reason: "The frame arrived chipped along the bottom edge.",
  ordersUrl: "https://wallplace.co.uk/artist-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistRefundRequestedProps> = {
  id: "artist_refund_requested",
  name: "Refund requested (to artist)",
  description: "A buyer has asked for a refund; no money has moved yet.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Refund request for order {{orderNumber}}",
  previewText: "A buyer has asked for a refund on your sale.",
  component: ArtistRefundRequested,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
