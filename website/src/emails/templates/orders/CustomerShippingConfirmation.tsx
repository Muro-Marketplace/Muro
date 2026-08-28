// Stream: tx. Shipping confirmation, tracking details.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerShippingConfirmationProps {
  firstName: string;
  orderNumber: string;
  trackingUrl: string;
  carrier: string;
  estimatedDelivery: string;
  orderUrl: string;
  /** Optional artwork preview shown above the tracking CTA. Caller
   *  passes the first line item's title + image so the buyer
   *  recognises the piece on its way without opening the order. */
  workTitle?: string;
  workImage?: string;
  artistName?: string;
}

export function CustomerShippingConfirmation({
  firstName,
  orderNumber,
  trackingUrl,
  carrier,
  estimatedDelivery,
  orderUrl,
  workTitle,
  workImage,
  artistName,
}: CustomerShippingConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Your order ${orderNumber} is on its way`}>
      <H1>On its way</H1>
      <P>Hi {firstName}, {orderNumber} has shipped with {carrier}. Estimated arrival: <strong>{estimatedDelivery}</strong>.</P>
      {workImage && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #E5E2DD", borderBottom: "1px solid #E5E2DD", margin: "12px 0" }}>
          <Img src={workImage} alt={workTitle || "Artwork"} width={72} height={72} style={{ display: "block", width: 72, height: 72, objectFit: "cover" as const, borderRadius: 4 }} />
          <div>
            {workTitle && <div style={{ fontSize: 14, color: "#1A1A1A" }}>{workTitle}</div>}
            {artistName && <div style={{ fontSize: 12, color: "#6B6B6B" }}>{artistName}</div>}
          </div>
        </div>
      )}
      <InfoBox tone="neutral">We&rsquo;ll email you again when it&rsquo;s delivered.</InfoBox>
      <Button href={trackingUrl} persona="customer">Track package</Button>
      <P style={{ marginTop: 16 }}>
        <a href={orderUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>View order</a>
      </P>
    </EmailShell>
  );
}

export const mock: CustomerShippingConfirmationProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  trackingUrl: "https://dpd.co.uk/track/WP28473",
  carrier: "DPD",
  estimatedDelivery: "Tuesday 28 April",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  workTitle: "Coastal Light",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
  artistName: "Maya Chen",
};

const entry: TemplateEntry<CustomerShippingConfirmationProps> = {
  id: "customer_shipping_confirmation",
  name: "Shipping confirmation",
  description: "RETIRED, superseded by customer_order_out_for_delivery. Not wired to any trigger.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Your order {{orderNumber}} is on its way",
  previewText: "Tracking details inside.",
  component: CustomerShippingConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
