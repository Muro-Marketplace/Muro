// Stream: tx. The artist's settlement note for a Wallplace Programme.
//
// settleProgrammeRent (src/lib/curation/programme-rent.ts) pays each artist's
// accrued rent once a quarter, as one Stripe Connect transfer per artist. The
// transfer is SCHEDULED, not executed: it is released after the same holding
// period every other Connect transfer sits through, then follows the artist's
// own Stripe payout schedule. The copy says exactly that rather than naming a
// date it cannot know. Modelled on ArtistPayoutSent.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistProgrammeRentSettledProps {
  firstName: string;
  amount: Money;
  /** The settled period as a person would say it, e.g. "the period up to 30 September 2026". */
  periodLabel: string;
  payoutUrl: string;
  supportUrl?: string;
}

export function ArtistProgrammeRentSettled({
  firstName,
  amount,
  periodLabel,
  payoutUrl,
  supportUrl,
}: ArtistProgrammeRentSettledProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Programme rent on the way: ${formatMoney(amount)}`}>
      <H1>{formatMoney(amount)} of programme rent on its way</H1>
      <P>
        Hi {firstName}, your programme rent for {periodLabel} has been settled, and a transfer of{" "}
        <strong>{formatMoney(amount)}</strong> to the Stripe account connected to your Wallplace
        account has been scheduled.
      </P>
      <InfoBox tone="neutral">
        Transfers are released after a holding period of around two weeks, then land according to
        your Stripe payout schedule.
      </InfoBox>
      <Button href={payoutUrl} persona="artist">
        View payouts
      </Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistProgrammeRentSettledProps = {
  firstName: "Maya",
  amount: { amount: 6000, currency: "GBP" },
  periodLabel: "the period up to 30 September 2026",
  payoutUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistProgrammeRentSettledProps> = {
  id: "artist_programme_rent_settled",
  name: "Programme rent settled",
  description:
    "Sent to an artist when their quarter's programme rent is settled and the Stripe transfer is scheduled.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Programme rent on the way",
  previewText: "Your quarter's programme rent has been settled.",
  component: ArtistProgrammeRentSettled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
