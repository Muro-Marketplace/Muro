// Stream: notify. 3 days after delivery, care tips specific to the piece.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerPostPurchaseCareProps {
  firstName: string;
  workTitle: string;
  artistName: string;
  careTips: string[];
  orderUrl: string;
}

export function CustomerPostPurchaseCare({ firstName, workTitle, artistName, careTips, orderUrl }: CustomerPostPurchaseCareProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="tips" preview={`Looking after ${workTitle}`}>
      <H1>Looking after {workTitle}</H1>
      <P>Hi {firstName}, a few notes from {artistName} on keeping the piece at its best.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {careTips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <Button href={orderUrl} persona="customer">View order</Button>
    </EmailShell>
  );
}

export const mock: CustomerPostPurchaseCareProps = {
  firstName: "Oliver",
  workTitle: "Last Light on Mare Street",
  artistName: "Maya Chen",
  careTips: [
    "Keep out of direct sunlight to avoid fading",
    "Wipe the frame with a dry microfibre cloth, no sprays",
    "Aim for steady humidity (40-60%) if possible",
  ],
  orderUrl: "https://wallplace.co.uk/orders/WP-28473",
};

const entry: TemplateEntry<CustomerPostPurchaseCareProps> = {
  id: "customer_post_purchase_care",
  name: "Post-purchase care guide",
  description: "+3d care tips specific to the piece.",
  stream: "notify",
  persona: "customer",
  category: "tips",
  subject: "Looking after {{workTitle}}",
  previewText: "A few notes from the artist.",
  component: CustomerPostPurchaseCare,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
