// Stream: tx. Someone bought a piece off this venue's wall and is coming for it.
//
// T9 / 04 Phase 8 item 8.6. A collect-from-venue sale involves the venue as a
// physical party — a stranger will present an order number at the bar — so a
// sale the venue is not told about is a confrontation waiting at the counter.

import { EmailShell, H1, P, Small, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueCollectionPendingProps {
  venueName: string;
  workTitle: string;
  artistName: string;
  orderNumber: string;
  buyerName: string;
  placementsUrl: string;
  supportUrl?: string;
}

export function VenueCollectionPending({
  venueName,
  workTitle,
  artistName,
  orderNumber,
  buyerName,
  placementsUrl,
  supportUrl,
}: VenueCollectionPendingProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`${workTitle} has sold and will be collected from you`}>
      <H1>A piece on your wall has sold</H1>
      <P>
        Hi {venueName}, good news: <strong>{workTitle}</strong> by {artistName} has just sold, and
        the buyer chose to collect it from you rather than have it shipped.
      </P>
      <InfoBox tone="info">
        <strong>What to expect</strong>
        <div style={{ marginTop: 4 }}>
          {buyerName} will come in and show order number <strong>{orderNumber}</strong>. Check the
          number matches before handing the piece over, and that&rsquo;s it done.
        </div>
      </InfoBox>
      <P>
        If this placement carries a revenue share, your share of this sale is recorded against it
        and is released once the buyer confirms they have picked the piece up. Do prompt them to,
        it pays the artist too. The wall space is yours again from that moment.
      </P>
      <Button href={placementsUrl}>View the placement</Button>
      <P>
        <Small>If anything about the collection doesn&rsquo;t look right, don&rsquo;t hand the piece over. Get in touch instead.</Small>
      </P>
    </EmailShell>
  );
}

export const mock: VenueCollectionPendingProps = {
  venueName: "The Copper Kettle",
  workTitle: "Vietnamese Village",
  artistName: "Fin Coles",
  orderNumber: "WS-q0g0tqwD",
  buyerName: "Jo",
  placementsUrl: "https://wallplace.co.uk/venue-portal/placements",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenueCollectionPendingProps> = {
  id: "venue_collection_pending",
  name: "Venue collection pending",
  description: "A collect-from-venue sale: the buyer will come in with an order number.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "{{workTitle}} has sold and will be collected from you",
  previewText: "Check the order number matches before handing it over.",
  component: VenueCollectionPending,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
