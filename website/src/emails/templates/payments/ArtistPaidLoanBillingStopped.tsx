// Stream: tx. To the ARTIST when a venue's monthly paid-loan billing stops.
//
// Counterpart to VenuePaidLoanBillingStopped. The artist's monthly payout is
// what ends here, so a bell alone was not enough: this is a money event and
// the artist needs it in writing, including that a share already collected is
// still paid out.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPaidLoanBillingStoppedProps {
  artistFirstName: string;
  workTitle: string;
  venueName: string;
  placementUrl: string;
  supportUrl?: string;
}

export function ArtistPaidLoanBillingStopped({
  artistFirstName,
  workTitle,
  venueName,
  placementUrl,
  supportUrl,
}: ArtistPaidLoanBillingStoppedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Monthly payments have stopped for ${workTitle}`}>
      <H1>Monthly payments have stopped for {workTitle}</H1>
      <P>
        Hi {artistFirstName}, the monthly payments from {venueName} for {workTitle} have ended, so
        no further monthly payouts will follow for this placement. Your share of any payment
        already collected is still paid out on the usual schedule.
      </P>
      <P>
        If the work is still at the venue, arrange collection with them from the placement page.
      </P>
      <Button href={placementUrl} persona="artist">View placement</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistPaidLoanBillingStoppedProps = {
  artistFirstName: "Fin",
  workTitle: "Mt. Fitz Roy",
  venueName: "The Curzon",
  placementUrl: "https://wallplace.co.uk/placements/p-123",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistPaidLoanBillingStoppedProps> = {
  id: "artist_paid_loan_billing_stopped",
  name: "Paid loan: billing stopped (to artist)",
  description: "The venue's monthly payments have ended, so the monthly payouts stop.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Monthly payments have stopped for {{workTitle}}",
  previewText: "No further monthly payouts for this placement.",
  component: ArtistPaidLoanBillingStopped,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
