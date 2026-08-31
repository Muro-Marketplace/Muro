// Stream: tx (orders_and_payouts).

import { EmailShell, H1, P, Button, SupportBlock, InfoBox } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPayoutSentProps {
  firstName: string;
  payoutAmount: Money;
  payoutDate: string;
  expectedArrival: string;
  payoutUrl: string;
  supportUrl?: string;
}

export function ArtistPayoutSent({ firstName, payoutAmount, payoutDate, expectedArrival, payoutUrl, supportUrl }: ArtistPayoutSentProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Payout on the way: ${formatMoney(payoutAmount)}`}>
      <H1>{formatMoney(payoutAmount)} on its way</H1>
      <P>Hi {firstName}, your payout was sent on {payoutDate}. Expected to land by <strong>{expectedArrival}</strong>.</P>
      <InfoBox tone="neutral">Payouts go via Stripe to the bank account connected to your Wallplace account.</InfoBox>
      <Button href={payoutUrl} persona="artist">View payout</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistPayoutSentProps = {
  firstName: "Maya",
  payoutAmount: { amount: 21600, currency: "GBP" },
  payoutDate: "24 April 2026",
  expectedArrival: "28 April 2026",
  // R6.F1: /artist-portal/billing/payouts does not exist; the Payouts section
  // lives on the billing page itself, so that is where this button must go.
  payoutUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistPayoutSentProps> = {
  id: "artist_payout_sent",
  name: "Payout sent",
  description: "Confirms a Stripe payout has been initiated.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Payout on the way: {{amount}}",
  previewText: "Expected arrival inside.",
  component: ArtistPayoutSent,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
