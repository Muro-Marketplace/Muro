// Stream: tx (orders_and_payouts). The venue variant of ArtistPayoutSent.
//
// payout.paid resolved the Connect account against artist_profiles only, so a
// venue whose revenue share left Stripe for their bank was told nothing (the
// failure case, payout.failed, already resolved venues). Same moment, same
// shape, a venue's words and a venue's link.

import { EmailShell, H1, P, Button, SupportBlock, InfoBox } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePayoutSentProps {
  firstName: string;
  payoutAmount: Money;
  payoutDate: string;
  expectedArrival: string;
  ordersUrl: string;
  supportUrl?: string;
}

export function VenuePayoutSent({ firstName, payoutAmount, payoutDate, expectedArrival, ordersUrl, supportUrl }: VenuePayoutSentProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`Payout on the way: ${formatMoney(payoutAmount)}`}>
      <H1>{formatMoney(payoutAmount)} on its way</H1>
      <P>
        Hi {firstName}, your venue&rsquo;s share of sales through Wallplace was sent on {payoutDate}.
        Expected to land by <strong>{expectedArrival}</strong>.
      </P>
      <InfoBox tone="neutral">
        Payouts go via Stripe to the bank account connected to your Wallplace venue account.
      </InfoBox>
      <Button href={ordersUrl} persona="venue">View sales</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenuePayoutSentProps = {
  firstName: "Hannah",
  payoutAmount: { amount: 4800, currency: "GBP" },
  payoutDate: "24 April 2026",
  expectedArrival: "28 April 2026",
  ordersUrl: "https://wallplace.co.uk/venue-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenuePayoutSentProps> = {
  id: "venue_payout_sent",
  name: "Payout sent (to venue)",
  description: "Confirms a Stripe payout of the venue's share has been initiated.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "A payout is on its way to your bank",
  previewText: "Expected arrival inside.",
  component: VenuePayoutSent,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
