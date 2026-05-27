// Stream: tx. Phase 2.0c. Carrier-reported delivery notification, with
// an explicit "please confirm receipt" CTA so the customer can close
// the loop before the 48-hour auto-prompt fires.

import { EmailShell, H1, P, Button, SecondaryButton, Small, Divider } from "@/emails/_components";
import { Img } from "@react-email/components";
import type { TemplateEntry } from "@/emails/registry-types";
import { CONSUMER_RIGHTS_FOOTER } from "@/lib/email/constants";

export interface CustomerOrderDeliveredProps {
  firstName: string;
  orderNumber: string;
  deliveredAt: string;
  confirmUrl: string;
  reportProblemUrl: string;
  orderUrl: string;
  workTitle?: string;
  workImage?: string;
  artistName?: string;
}

export function CustomerOrderDelivered(p: CustomerOrderDeliveredProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`${p.orderNumber} has arrived`}>
      <H1>It&rsquo;s arrived</H1>
      <P>
        Hi {p.firstName}, your order <strong>{p.orderNumber}</strong> was marked as
        delivered on {p.deliveredAt}. Tap below to confirm it arrived in good order so we
        can release payment to the artist.
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
      <div>
        <Button href={p.confirmUrl} persona="customer">Confirm delivery</Button>{" "}
        <SecondaryButton href={p.reportProblemUrl} persona="customer">Report a problem</SecondaryButton>
      </div>
      <P style={{ marginTop: 16 }}>
        <a href={p.orderUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>View full order</a>
      </P>
      <Divider />
      <Small>{CONSUMER_RIGHTS_FOOTER}</Small>
    </EmailShell>
  );
}

export const mock: CustomerOrderDeliveredProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  deliveredAt: "Tuesday, 28 April",
  confirmUrl: "https://wallplace.co.uk/orders/WP-28473/confirm",
  reportProblemUrl: "https://wallplace.co.uk/contact?order=WP-28473",
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
  workTitle: "Last Light on Mare Street",
  workImage: "https://wallplace.co.uk/sample-work.jpg",
  artistName: "Maya Chen",
};

const entry: TemplateEntry<CustomerOrderDeliveredProps> = {
  id: "customer_order_delivered",
  name: "Customer: delivered",
  description: "Carrier-reported delivery with confirm CTA (Phase 2 lifecycle).",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "{{orderNumber}} has arrived",
  previewText: "Please confirm receipt so we can pay the artist.",
  component: CustomerOrderDelivered,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
