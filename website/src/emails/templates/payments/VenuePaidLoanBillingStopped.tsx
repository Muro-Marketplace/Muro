// Stream: tx. To the VENUE when the monthly paid-loan billing stops
// (customer.subscription.deleted for a placement_recurring_billings row).
//
// The wind-down used to be a bell and nothing else: a venue whose card had been
// charged monthly heard in writing when it started (now) and when it failed,
// but not when it ended. The copy is true whatever ended it (the placement was
// ended, the card failed for good, or an operator cancelled it): no further
// charges, the paid month stands, arrange collection if the work is still up.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePaidLoanBillingStoppedProps {
  venueFirstName: string;
  workTitle: string;
  artistName: string;
  monthlyFee?: Money;
  placementUrl: string;
  supportUrl?: string;
}

export function VenuePaidLoanBillingStopped({
  venueFirstName,
  workTitle,
  artistName,
  monthlyFee,
  placementUrl,
  supportUrl,
}: VenuePaidLoanBillingStoppedProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`Monthly payments have stopped for ${workTitle}`}>
      <H1>Monthly payments have stopped for {workTitle}</H1>
      <P>
        Hi {venueFirstName}, the monthly payments for {workTitle} by {artistName} have ended.
        Nothing more will be charged to your card for this placement, and any month already paid
        for stands.
      </P>
      {monthlyFee ? (
        <InfoBox tone="neutral">
          <strong>Monthly fee that has stopped:</strong> {formatMoney(monthlyFee)}
        </InfoBox>
      ) : null}
      <P>
        If the artwork is still on your wall, message {artistName} from the placement page to
        arrange collection. If you did not expect this, contact support and we will look into it.
      </P>
      <Button href={placementUrl} persona="venue">View placement</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenuePaidLoanBillingStoppedProps = {
  venueFirstName: "Sam",
  workTitle: "Mt. Fitz Roy",
  artistName: "Fin Coles",
  monthlyFee: { amount: 4500, currency: "GBP" },
  placementUrl: "https://wallplace.co.uk/placements/p-123",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenuePaidLoanBillingStoppedProps> = {
  id: "venue_paid_loan_billing_stopped",
  name: "Paid loan: billing stopped (to venue)",
  description: "The monthly charge has ended; no further payments will be taken.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Monthly payments have stopped for {{workTitle}}",
  previewText: "No further charges for this placement.",
  component: VenuePaidLoanBillingStopped,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
