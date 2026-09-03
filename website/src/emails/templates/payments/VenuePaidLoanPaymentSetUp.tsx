// Stream: tx. To the VENUE once the monthly paid-loan payment is set up, from
// the webhook's paid_loan_monthly checkout branch.
//
// The venue had just committed to a recurring card charge and got nothing in
// writing: the artist was told by a bell and the venue by nobody. Modelled on
// SubscriptionStarted, because it is the same moment for a different payer:
// the amount, the cadence, the first and next charge dates, and how to stop.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePaidLoanPaymentSetUpProps {
  venueFirstName: string;
  artistName: string;
  workTitle: string;
  monthlyFee: Money;
  /** The first charge: the date it was taken at checkout, or the trial end. */
  firstChargeDate: string;
  nextChargeDate: string;
  /** Set when the subscription starts with a trial: nothing is charged before it. */
  trialEndsAt?: string;
  placementUrl: string;
  supportUrl?: string;
}

export function VenuePaidLoanPaymentSetUp({
  venueFirstName,
  artistName,
  workTitle,
  monthlyFee,
  firstChargeDate,
  nextChargeDate,
  trialEndsAt,
  placementUrl,
  supportUrl,
}: VenuePaidLoanPaymentSetUpProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`Monthly payments are set up for ${workTitle}`}>
      <H1>Monthly payments are set up for {workTitle}</H1>
      <P>
        Hi {venueFirstName}, your card is set up for the paid loan of {workTitle} by {artistName}.
        The fee is <strong>{formatMoney(monthlyFee)} a month</strong>, taken automatically, and{" "}
        {artistName} is paid their share after each payment.
      </P>
      {trialEndsAt ? (
        <InfoBox tone="info">
          <strong>Nothing is charged before {trialEndsAt}.</strong>
          <div style={{ marginTop: 4 }}>
            The first payment is on {firstChargeDate}, then monthly on the same day.
          </div>
        </InfoBox>
      ) : (
        <InfoBox tone="info">
          <strong>First payment: {firstChargeDate}</strong>
          <div style={{ marginTop: 4 }}>
            Next one after that: {nextChargeDate}, then monthly on the same day.
          </div>
        </InfoBox>
      )}
      <P>
        To stop the payments, end the placement from its page. Billing stops at the end of the
        month you have already paid for, and there is no refund for that month.
      </P>
      <Button href={placementUrl} persona="venue">View placement</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenuePaidLoanPaymentSetUpProps = {
  venueFirstName: "Sam",
  artistName: "Fin Coles",
  workTitle: "Mt. Fitz Roy",
  monthlyFee: { amount: 4500, currency: "GBP" },
  firstChargeDate: "24 May 2026",
  nextChargeDate: "24 June 2026",
  placementUrl: "https://wallplace.co.uk/placements/p-123",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenuePaidLoanPaymentSetUpProps> = {
  id: "venue_paid_loan_payment_set_up",
  name: "Paid loan: payment set up (to venue)",
  description: "Confirms the monthly charge, its dates and how to stop it, once the venue's card is set up.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Monthly payments are set up for {{workTitle}}",
  previewText: "Amount, dates and how to stop.",
  component: VenuePaidLoanPaymentSetUp,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
