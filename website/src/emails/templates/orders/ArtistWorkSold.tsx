// Stream: notify. The artist's celebration email — "you made a sale".

import { EmailShell, H1, P, Button, SecondaryButton, InfoBox } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistWorkSoldProps {
  firstName: string;
  workTitle: string;
  orderNumber: string;
  saleAmount: Money;
  nextSteps: string[];
  orderUrl: string;
  shippingInstructionsUrl: string;
}

export function ArtistWorkSold({ firstName, workTitle, orderNumber, saleAmount, nextSteps, orderUrl, shippingInstructionsUrl }: ArtistWorkSoldProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="orders_and_payouts" preview={`${workTitle} just sold for ${formatMoney(saleAmount)}`}>
      <H1>You made a sale</H1>
      <P>Hi {firstName} — <strong>{workTitle}</strong> just sold for <strong>{formatMoney(saleAmount)}</strong> (order {orderNumber}).</P>
      <InfoBox tone="info">
        <strong>What&rsquo;s next</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {nextSteps.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </InfoBox>
      <div style={{ marginTop: 16 }}>
        <Button href={shippingInstructionsUrl} persona="artist">Arrange shipping</Button>{" "}
        <SecondaryButton href={orderUrl} persona="artist">View order</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: ArtistWorkSoldProps = {
  firstName: "Maya",
  workTitle: "Last Light on Mare Street",
  orderNumber: "WP-28473",
  saleAmount: { amount: 24000, currency: "GBP" },
  nextSteps: [
    "Pack the piece securely (we have packing guidelines in the portal)",
    "Print the shipping label we&rsquo;ve generated",
    "Drop off or arrange collection within 3 business days",
  ],
  orderUrl: "https://wallplace.co.uk/artist-portal/orders/WP-28473",
  shippingInstructionsUrl: "https://wallplace.co.uk/artist-portal/orders/WP-28473/ship",
};

const entry: TemplateEntry<ArtistWorkSoldProps> = {
  id: "artist_work_sold",
  name: "Artist: work sold",
  description: "Celebration + logistics.",
  stream: "notify",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "You made a sale — {{workTitle}}",
  previewText: "A piece of yours has sold.",
  component: ArtistWorkSold,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
