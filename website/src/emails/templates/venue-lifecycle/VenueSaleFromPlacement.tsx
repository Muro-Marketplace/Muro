// Stream: tx. A work on this venue's wall has sold, and the venue has earned a
// revenue share on it.
//
// K1: replaces notifyVenueOrderFromPlacement from the deleted lib/email.ts.
// Distinct from VenueRevenueShareStatement, which is the periodic summary; this
// is the single-sale notice, and it carries money, so losing the email_events
// row mattered.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueSaleFromPlacementProps {
  firstName: string;
  venueName: string;
  artistName: string;
  workTitle: string;
  saleTotal: Money;
  venueShare: Money;
  ordersUrl: string;
  supportUrl?: string;
}

export function VenueSaleFromPlacement({
  firstName,
  venueName,
  artistName,
  workTitle,
  saleTotal,
  venueShare,
  ordersUrl,
  supportUrl,
}: VenueSaleFromPlacementProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`${workTitle} sold from ${venueName}`}>
      <H1>A sale from your wall</H1>
      <P>
        Hi {firstName}, {workTitle} by {artistName} was bought from {venueName}.
      </P>
      <InfoBox tone="info">
        <strong>Sale total:</strong> {formatMoney(saleTotal)}
        <br />
        <strong>Your revenue share:</strong> {formatMoney(venueShare)}
      </InfoBox>
      <Button href={ordersUrl} persona="venue">View in your portal</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenueSaleFromPlacementProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  workTitle: "Last Light on Mare Street",
  saleTotal: { amount: 24000, currency: "GBP" },
  venueShare: { amount: 2400, currency: "GBP" },
  ordersUrl: "https://wallplace.co.uk/venue-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenueSaleFromPlacementProps> = {
  id: "venue_sale_from_placement",
  name: "Sale from your venue",
  description: "A single sale from a placement, with the venue's share.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Sale from your venue: {{workTitle}}",
  previewText: "A work on your wall has sold.",
  component: VenueSaleFromPlacement,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
