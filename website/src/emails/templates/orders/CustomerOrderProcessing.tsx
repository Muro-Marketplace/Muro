// Stream: tx. Phase 2.0c. Customer-facing notification that the artist
// has started preparing the order. Binds to `order.processing`.

import { EmailShell, H1, P, Button, Small, InfoBox, Divider } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";
import { CONSUMER_RIGHTS_FOOTER } from "@/lib/email/constants";

export interface CustomerOrderProcessingProps {
  firstName: string;
  orderNumber: string;
  orderUrl: string;
  artistName: string;
  workTitle?: string;
  workImage?: string;
  estimatedDispatch?: string;
}

export function CustomerOrderProcessing(p: CustomerOrderProcessingProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`${p.orderNumber} is being prepared`}>
      <H1>{p.artistName} is preparing your piece</H1>
      <P>
        Hi {p.firstName}, your order <strong>{p.orderNumber}</strong> has moved into
        production. {p.artistName} is packing it for dispatch
        {p.estimatedDispatch ? `, expected to ship by ${p.estimatedDispatch}` : ""}.
      </P>
      {p.workImage && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #E5E2DD", borderBottom: "1px solid #E5E2DD", margin: "12px 0" }}>
          <Img src={p.workImage} alt={p.workTitle || "Artwork"} width={72} height={72} style={{ display: "block", width: 72, height: 72, objectFit: "cover" as const, borderRadius: 4 }} />
          <div>
            {p.workTitle && <div style={{ fontSize: 14, color: "#1A1A1A" }}>{p.workTitle}</div>}
            <div style={{ fontSize: 12, color: "#6B6B6B" }}>{p.artistName}</div>
          </div>
        </div>
      )}
      <InfoBox tone="neutral">We&rsquo;ll send you a tracking link the moment it ships.</InfoBox>
      <Button href={p.orderUrl} persona="customer">View order</Button>
      <Divider />
      <Small>{CONSUMER_RIGHTS_FOOTER}</Small>
    </EmailShell>
  );
}

export const mock: CustomerOrderProcessingProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  artistName: "Maya Chen",
  workTitle: "Last Light on Mare Street",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
  estimatedDispatch: "Friday 27 April",
};

const entry: TemplateEntry<CustomerOrderProcessingProps> = {
  id: "customer_order_processing",
  name: "Customer: order processing",
  description: "Artist has started preparing the order (Phase 2 lifecycle).",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "{{orderNumber}} is being prepared",
  previewText: "Your artist is on it.",
  component: CustomerOrderProcessing,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
