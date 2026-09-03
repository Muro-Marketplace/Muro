// Stream: tx. Renewal receipt to the venue paying for a programme or a
// managed-curation subscription.
//
// A renewal is money landing again, and until this existed only the admin
// heard about it (src/lib/curation/billing.ts alerts on every
// subscription_cycle invoice). The venue's first payment has its own
// confirmation (CurationProgrammeConfirmed / CurationPaymentReceived); this
// is the receipt for every payment after that. Modelled on
// VenuePaidLoanInvoice, the paid-loan venue's monthly receipt.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { curationKindLabel, type CurationSubscriptionKind } from "./CurationPaymentFailed";

export interface CurationRenewalReceiptProps {
  contactFirstName: string;
  venueName: string;
  kind: CurationSubscriptionKind;
  invoiceNumber: string;
  amountPaid: Money;
  /** Already formatted for display, e.g. "4 September 2026". */
  paidOn: string;
  billingInterval: "month" | "quarter";
  /** Stripe's hosted invoice page, or a Wallplace fallback when Stripe sent none. */
  invoiceUrl: string;
  supportUrl?: string;
}

export function CurationRenewalReceipt({
  contactFirstName,
  venueName,
  kind,
  invoiceNumber,
  amountPaid,
  paidOn,
  billingInterval,
  invoiceUrl,
  supportUrl,
}: CurationRenewalReceiptProps) {
  const label = curationKindLabel(kind);
  const interval = billingInterval === "quarter" ? "quarter" : "month";
  return (
    <EmailShell stream="tx" persona="venue" preview={`Payment received for ${venueName}`}>
      <H1>Payment received, thank you</H1>
      <P>
        Hi {contactFirstName}, this {interval}&rsquo;s payment for the {label} at {venueName} has
        gone through. Here is your receipt.
      </P>
      <InfoBox tone="neutral">
        <strong>Amount:</strong> {formatMoney(amountPaid)}
        <br />
        <strong>Invoice:</strong> {invoiceNumber}
        <br />
        <strong>Paid on:</strong> {paidOn}
      </InfoBox>
      {kind === "programme" && (
        <P>
          Every artist whose work is on your walls is paid rent out of this payment, for as long as
          it is up.
        </P>
      )}
      <Button href={invoiceUrl} persona="venue">
        View invoice
      </Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationRenewalReceiptProps = {
  contactFirstName: "Sam",
  venueName: "Riverside Offices",
  kind: "programme",
  invoiceNumber: "WP-INV-00517",
  amountPaid: { amount: 25000, currency: "GBP" },
  paidOn: "4 September 2026",
  billingInterval: "month",
  invoiceUrl: "https://invoice.stripe.com/i/acct_example/test_example",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationRenewalReceiptProps> = {
  id: "curation_renewal_receipt",
  name: "Programme or curation: renewal receipt",
  description:
    "Receipt to the paying venue on every renewal invoice of a programme or managed-curation subscription.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Payment received for {{venueName}}",
  previewText: "Your renewal payment has gone through.",
  component: CurationRenewalReceipt,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
