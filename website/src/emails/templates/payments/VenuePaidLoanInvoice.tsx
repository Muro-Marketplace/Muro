// Stream: tx. Monthly paid-loan invoice.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePaidLoanInvoiceProps {
  firstName: string;
  venueName: string;
  invoiceNumber: string;
  amountDue: Money;
  dueDate: string;
  invoiceUrl: string;
  supportUrl?: string;
}

export function VenuePaidLoanInvoice({ firstName, venueName, invoiceNumber, amountDue, dueDate, invoiceUrl, supportUrl }: VenuePaidLoanInvoiceProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`${venueName} invoice ${invoiceNumber}`}>
      <H1>Invoice {invoiceNumber}</H1>
      <P>Hi {firstName} — {venueName}&rsquo;s paid loan invoice is ready.</P>
      <InfoBox tone="neutral">
        <strong>Amount:</strong> {formatMoney(amountDue)}<br />
        <strong>Due:</strong> {dueDate}
      </InfoBox>
      <Button href={invoiceUrl} persona="venue">View &amp; pay invoice</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenuePaidLoanInvoiceProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  invoiceNumber: "WP-INV-00432",
  amountDue: { amount: 12000, currency: "GBP" },
  dueDate: "8 May 2026",
  invoiceUrl: "https://wallplace.co.uk/venue-portal/billing/invoices/WP-INV-00432",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenuePaidLoanInvoiceProps> = {
  id: "venue_paid_loan_invoice",
  name: "Paid loan invoice",
  description: "Monthly paid-loan invoice for venues.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Invoice {{invoiceNumber}} — {{venueName}}",
  previewText: "Pay in a tap.",
  component: VenuePaidLoanInvoice,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
