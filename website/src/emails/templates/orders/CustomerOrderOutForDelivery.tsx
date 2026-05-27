// Stream: tx. Phase 2.0c. Out-for-delivery / dispatched notification.
// Binds to `order.out_for_delivery`. Replaces the role previously held
// by CustomerShippingConfirmation for the J1 dispatcher path.

import { EmailShell, H1, P, Button, Small, InfoBox, Divider } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";
import { CONSUMER_RIGHTS_FOOTER } from "@/lib/email/constants";

export interface CustomerOrderOutForDeliveryProps {
  firstName: string;
  orderNumber: string;
  trackingUrl?: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  orderUrl: string;
  workTitle?: string;
  workImage?: string;
  artistName?: string;
}

export function CustomerOrderOutForDelivery(p: CustomerOrderOutForDeliveryProps) {
  const hasTracking = Boolean(p.trackingUrl);
  return (
    <EmailShell stream="tx" persona="customer" preview={`${p.orderNumber} is on its way`}>
      <H1>On its way</H1>
      <P>
        Hi {p.firstName}, your order <strong>{p.orderNumber}</strong>
        {p.carrier ? ` has been dispatched with ${p.carrier}` : " has been dispatched"}
        {p.estimatedDelivery ? `. Estimated arrival: ${p.estimatedDelivery}.` : "."}
      </P>
      {p.workImage && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #E5E2DD", borderBottom: "1px solid #E5E2DD", margin: "12px 0" }}>
          <Img src={p.workImage} alt={p.workTitle || "Artwork"} width={72} height={72} style={{ display: "block", width: 72, height: 72, objectFit: "cover" as const, borderRadius: 4 }} />
          <div>
            {p.workTitle && <div style={{ fontSize: 14, color: "#1A1A1A" }}>{p.workTitle}</div>}
            {p.artistName && <div style={{ fontSize: 12, color: "#6B6B6B" }}>{p.artistName}</div>}
          </div>
        </div>
      )}
      {p.trackingNumber && (
        <InfoBox tone="neutral">
          Tracking reference: <strong>{p.trackingNumber}</strong>
        </InfoBox>
      )}
      {hasTracking && p.trackingUrl ? (
        <Button href={p.trackingUrl} persona="customer">Track package</Button>
      ) : (
        <Button href={p.orderUrl} persona="customer">View order</Button>
      )}
      <P style={{ marginTop: 16 }}>
        <a href={p.orderUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>View order</a>
      </P>
      <Divider />
      <Small>{CONSUMER_RIGHTS_FOOTER}</Small>
    </EmailShell>
  );
}

export const mock: CustomerOrderOutForDeliveryProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  trackingUrl: "https://dpd.co.uk/track/WP28473",
  trackingNumber: "DPD-WP-28473",
  carrier: "DPD",
  estimatedDelivery: "Tuesday 28 April",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  workTitle: "Last Light on Mare Street",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
  artistName: "Maya Chen",
};

const entry: TemplateEntry<CustomerOrderOutForDeliveryProps> = {
  id: "customer_order_out_for_delivery",
  name: "Customer: out for delivery",
  description: "Dispatch notification with tracking (Phase 2 lifecycle).",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "{{orderNumber}} is on its way",
  previewText: "Tracking details inside.",
  component: CustomerOrderOutForDelivery,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
