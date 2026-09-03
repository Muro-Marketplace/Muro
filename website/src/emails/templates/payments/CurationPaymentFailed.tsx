// Stream: tx. Programme and managed-curation dunning to the paying venue.
//
// Until this existed, invoice.payment_failed on a curation subscription
// (src/lib/curation/billing.ts, handleCurationInvoiceFailed) flipped the row
// to past_due or paused and told nobody: not the venue whose card had
// failed, not the team whose curator was still doing the work. The paid-loan
// sibling (PaidLoanPaymentFailed) already had this shape, so it is mirrored
// here: a retryable failure asks for the card to be fixed, the final failure
// says the subscription is paused and what that means.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export type CurationSubscriptionKind = "programme" | "managed";

/** How the subscription is named in copy. Exported so the send site and the sibling templates agree. */
export function curationKindLabel(kind: CurationSubscriptionKind): string {
  return kind === "programme" ? "Wallplace Programme" : "managed curation subscription";
}

export interface CurationPaymentFailedProps {
  contactFirstName: string;
  venueName: string;
  kind: CurationSubscriptionKind;
  amountDue: Money;
  /** True when Stripe has exhausted its retries and the subscription is paused. */
  finalAttempt: boolean;
  /** Stripe's hosted invoice page: pay the invoice or update the card in one place. */
  payUrl: string;
  supportUrl?: string;
}

export function CurationPaymentFailed({
  contactFirstName,
  venueName,
  kind,
  amountDue,
  finalAttempt,
  payUrl,
  supportUrl,
}: CurationPaymentFailedProps) {
  const label = curationKindLabel(kind);
  return (
    <EmailShell stream="tx" persona="venue" preview={`Your ${label} payment failed`}>
      <H1>
        {finalAttempt
          ? `Your ${kind === "programme" ? "programme" : "curation"} payments are paused, ${contactFirstName}`
          : `Your ${kind === "programme" ? "programme" : "curation"} payment failed, ${contactFirstName}`}
      </H1>
      <P>
        {finalAttempt
          ? `We could not collect the payment for the ${label} at ${venueName} after several attempts, so the subscription is paused. Curation work for ${venueName} pauses with it until the payment is sorted.`
          : `The payment for the ${label} at ${venueName} did not go through. Your card may have expired or been declined. Stripe will retry automatically, and paying the invoice or updating your card fixes it fastest.`}
      </P>
      {finalAttempt && kind === "programme" && (
        <P>
          The artists whose work is on your walls are paid rent out of each programme payment, so
          their rent stops while the subscription is paused.
        </P>
      )}
      <InfoBox tone={finalAttempt ? "warning" : "info"}>
        <strong>Amount due:</strong> {formatMoney(amountDue)}
        <br />
        <strong>Venue:</strong> {venueName}
      </InfoBox>
      <Button href={payUrl} persona="venue">
        {finalAttempt ? "Pay the invoice" : "Update payment method"}
      </Button>
      <P>
        {finalAttempt
          ? "Once the payment goes through, everything carries on as agreed. If you would rather end the arrangement instead, contact support and we will sort it out with you."
          : "Nothing else changes while Stripe retries."}
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationPaymentFailedProps = {
  contactFirstName: "Sam",
  venueName: "Riverside Offices",
  kind: "programme",
  amountDue: { amount: 25000, currency: "GBP" },
  finalAttempt: false,
  payUrl: "https://invoice.stripe.com/i/acct_example/test_example",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationPaymentFailedProps> = {
  id: "curation_payment_failed",
  name: "Programme or curation: payment failed",
  description:
    "Dunning to the paying venue when a programme or managed-curation subscription payment fails or the subscription pauses.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace programme payment failed",
  previewText: "Your card was declined; paying the invoice or updating the card fixes it fastest.",
  component: CurationPaymentFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
