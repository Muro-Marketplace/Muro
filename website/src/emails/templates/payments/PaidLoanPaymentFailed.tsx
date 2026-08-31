// Stream: tx. Paid-loan dunning to the VENUE (the payer).
//
// WS4.3 (audit R2.7/R6.F2): invoice.payment_failed used to flip the billing
// row to past_due or paused and tell NOBODY, so a venue whose card expired
// kept the artwork on their wall while the artist silently went unpaid. Two
// intensities: a retryable failure asks for a card update; the final failure
// says the billing is paused and what happens next.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PaidLoanPaymentFailedProps {
  venueFirstName: string;
  workTitle: string;
  artistName: string;
  monthlyFee: Money;
  /** True when Stripe has exhausted its retries and the billing is paused. */
  finalAttempt: boolean;
  updatePaymentUrl: string;
  supportUrl?: string;
}

export function PaidLoanPaymentFailed({
  venueFirstName,
  workTitle,
  artistName,
  monthlyFee,
  finalAttempt,
  updatePaymentUrl,
  supportUrl,
}: PaidLoanPaymentFailedProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview="Your monthly display fee payment failed">
      <H1>
        {finalAttempt
          ? `Monthly payments are paused, ${venueFirstName}`
          : `Your display fee payment failed, ${venueFirstName}`}
      </H1>
      <P>
        {finalAttempt
          ? `We could not collect the monthly fee for ${workTitle} by ${artistName} after several attempts, so the billing is paused. The artist is not being paid while it stays paused.`
          : `The monthly fee for ${workTitle} by ${artistName} did not go through. Your card may have expired or been declined. We will retry automatically, and updating your card fixes it fastest.`}
      </P>
      <InfoBox tone={finalAttempt ? "warning" : "info"}>
        <strong>Monthly fee:</strong> {formatMoney(monthlyFee)}
        <br />
        <strong>Artwork:</strong> {workTitle}
      </InfoBox>
      <Button href={updatePaymentUrl}>Update payment method</Button>
      <P>
        {finalAttempt
          ? "Once the payment method is fixed, payments resume and the placement carries on as agreed. If you would rather end the placement, message the artist to arrange collection."
          : "Nothing else changes while we retry; the artwork stays on your wall."}
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: PaidLoanPaymentFailedProps = {
  venueFirstName: "Sam",
  workTitle: "Mt. Fitz Roy",
  artistName: "Fin Coles",
  monthlyFee: { amount: 4500, currency: "GBP" },
  finalAttempt: false,
  updatePaymentUrl: "https://wallplace.co.uk/placements/p-123/payment",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<PaidLoanPaymentFailedProps> = {
  id: "paid_loan_payment_failed",
  name: "Paid loan: payment failed",
  description: "Dunning to the venue when a monthly display fee payment fails or billing pauses.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your monthly display fee payment failed",
  previewText: "Your card was declined; updating it fixes it fastest.",
  component: PaidLoanPaymentFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
