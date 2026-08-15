// Stream: tx. Arrival confirmation + light post-purchase prompt.

import { EmailShell, H1, P, Button, SecondaryButton } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerDeliveryConfirmationProps {
  firstName: string;
  orderNumber: string;
  deliveredAt: string;
  careGuideUrl: string;
  reviewUrl: string;
  /** Optional artwork preview. Caller passes the first line item's
   *  title + image so the buyer sees what arrived without clicking
   *  through to the order. */
  workTitle?: string;
  workImage?: string;
  artistName?: string;
}

export function CustomerDeliveryConfirmation({
  firstName,
  orderNumber,
  deliveredAt,
  careGuideUrl,
  reviewUrl,
  workTitle,
  workImage,
  artistName,
}: CustomerDeliveryConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your order ${orderNumber} has arrived`}>
      <H1>It&rsquo;s arrived</H1>
      <P>Hi {firstName}, {orderNumber} was delivered {deliveredAt}. Hang it where the light is kind.</P>
      {workImage && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #E5E2DD", borderBottom: "1px solid #E5E2DD", margin: "12px 0" }}>
          <Img src={workImage} alt={workTitle || "Artwork"} width={72} height={72} style={{ display: "block", width: 72, height: 72, objectFit: "cover" as const, borderRadius: 4 }} />
          <div>
            {workTitle && <div style={{ fontSize: 14, color: "#1A1A1A" }}>{workTitle}</div>}
            {artistName && <div style={{ fontSize: 12, color: "#6B6B6B" }}>{artistName}</div>}
          </div>
        </div>
      )}
      <div>
        <Button href={careGuideUrl} persona="customer">Care guide</Button>{" "}
        <SecondaryButton href={reviewUrl} persona="customer">Leave a review</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerDeliveryConfirmationProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  deliveredAt: "Tuesday, 28 April",
  careGuideUrl: "https://wallplace.co.uk/care",
  reviewUrl: "https://wallplace.co.uk/orders/WP-28473/review",
  workTitle: "Coastal Light",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
  artistName: "Maya Chen",
};

const entry: TemplateEntry<CustomerDeliveryConfirmationProps> = {
  id: "customer_delivery_confirmation",
  name: "Delivery confirmation",
  description: "RETIRED, superseded by customer_order_delivered. Not wired to any trigger.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your order {{orderNumber}} has arrived",
  previewText: "Hang it where the light is kind.",
  component: CustomerDeliveryConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
