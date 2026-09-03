// Stream: tx (orders_and_payouts). To the ARTIST when the payout sweep has
// given up on a transfer (stripe-connect.ts, MAX_RETRIES reached).
//
// The exhausted case alerted an operator and nobody else: the artist whose
// money was stuck learned about it only when they noticed it had not arrived.
// Distinct from artist_payout_failed, which is Stripe failing to move money
// from the artist's Connect account to their BANK; this one is Wallplace
// failing to move it from the platform to their Connect account at all.
//
// The raw Stripe error stays with the admin alert. It names platform-side
// conditions an artist can do nothing about, and the one thing they can do is
// check their own payout details.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPayoutRetriesExhaustedProps {
  firstName: string;
  orderNumber: string;
  payoutAmount: Money;
  payoutDetailsUrl: string;
  supportUrl?: string;
}

export function ArtistPayoutRetriesExhausted({
  firstName,
  orderNumber,
  payoutAmount,
  payoutDetailsUrl,
  supportUrl,
}: ArtistPayoutRetriesExhaustedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`We could not send your payout for ${orderNumber}`}>
      <H1>We could not send your payout for {orderNumber}</H1>
      <P>
        Hi {firstName}, we tried to send your {formatMoney(payoutAmount)} payout for order{" "}
        <strong>{orderNumber}</strong> to your connected Stripe account several times over the
        last day, and every attempt failed. Your money is safe: it is held on Wallplace&rsquo;s
        side, nothing has been lost, and a person on our team is now looking into it.
      </P>
      <InfoBox tone="warning">
        The usual cause is a Stripe account that needs attention: payouts paused, a missing
        detail, or a bank account that still needs verifying. Please check your payout details.
        If anything is flagged there, fixing it is all that is needed.
      </InfoBox>
      <Button href={payoutDetailsUrl} persona="artist">Check payout details</Button>
      <P>
        We will email you once the payout has gone through. If nothing is flagged on your
        account, contact support and quote the order number.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistPayoutRetriesExhaustedProps = {
  firstName: "Maya",
  orderNumber: "WS-J6CRQS4XTX2DJRO7",
  payoutAmount: { amount: 21600, currency: "GBP" },
  payoutDetailsUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistPayoutRetriesExhaustedProps> = {
  id: "artist_payout_retries_exhausted",
  name: "Payout retries exhausted (to artist)",
  description: "Every automatic attempt to transfer a payout failed; a person is on it and the artist can check their details.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "We could not send your payout for {{orderNumber}}",
  previewText: "Your money is safe. Here is what happens next.",
  component: ArtistPayoutRetriesExhausted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
