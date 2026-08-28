// Stream: tx. Tells the venue to set up the monthly paid-loan payment.
//
// Owner decision 2026-08-28: the only prompt used to be a chip on the
// placements list, which a venue that does not revisit the portal never sees.
// The artwork is on their wall (or about to be); the money side must not rely
// on them stumbling across a pill. Keyed once per placement, so the accept
// transition and the live-on-wall transition cannot double-send.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PaidLoanSetUpPaymentProps {
  venueFirstName: string;
  artistName: string;
  workTitle: string;
  monthlyFee: Money;
  paymentUrl: string;
  supportUrl?: string;
}

export function PaidLoanSetUpPayment({
  venueFirstName,
  artistName,
  workTitle,
  monthlyFee,
  paymentUrl,
  supportUrl,
}: PaidLoanSetUpPaymentProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview="Set up the monthly payment for your placement">
      <H1>Next step: set up the monthly payment, {venueFirstName}</H1>
      <P>
        Your paid loan placement of {workTitle} by {artistName} is agreed. The last step is
        setting up the monthly payment, which takes about a minute with a card.
      </P>
      <InfoBox tone="info">
        <strong>Monthly fee:</strong> {formatMoney(monthlyFee)}
        <br />
        <strong>Artwork:</strong> {workTitle}
        <br />
        <strong>Artist:</strong> {artistName}
      </InfoBox>
      <Button href={paymentUrl}>Set up monthly payment</Button>
      <P>
        Payments start once you confirm, and you can see the status on the placement page at
        any time.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: PaidLoanSetUpPaymentProps = {
  venueFirstName: "Sam",
  artistName: "Fin Coles",
  workTitle: "Mt. Fitz Roy",
  monthlyFee: { amount: 4500, currency: "GBP" },
  paymentUrl: "https://wallplace.co.uk/placements/p-123/payment",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<PaidLoanSetUpPaymentProps> = {
  id: "paid_loan_setup_payment",
  name: "Paid loan: set up payment",
  description: "Asks the venue to set up the monthly payment once a paid loan is agreed.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Set up the monthly payment for your placement",
  previewText: "Your paid loan is agreed; payment setup takes a minute.",
  component: PaidLoanSetUpPayment,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
