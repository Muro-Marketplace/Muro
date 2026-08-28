// Stream: tx. Confirms a curation payment has settled and the brief is queued.
//
// K1: replaces notifyCurationCustomerPaid from the deleted lib/email.ts. This
// one is a payment receipt, so losing its audit trail mattered more than most:
// there was no record anywhere that it had been attempted.

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CurationPaymentReceivedProps {
  contactFirstName: string;
  venueName: string;
  tierLabel: string;
  amount: Money;
  shortlistDays: number;
  supportUrl?: string;
}

export function CurationPaymentReceived({
  contactFirstName,
  venueName,
  tierLabel,
  amount,
  shortlistDays,
  supportUrl,
}: CurationPaymentReceivedProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview="Your curation is underway">
      <H1>Payment received, thanks {contactFirstName}</H1>
      <P>Your curation for {venueName} is underway.</P>
      <InfoBox tone="info">
        <strong>Paid:</strong> {formatMoney(amount)}
        <br />
        <strong>Service:</strong> {tierLabel}
        <br />
        <strong>Venue:</strong> {venueName}
      </InfoBox>
      <P>
        Our curators will review your brief and email you a shortlist within {shortlistDays}{" "}
        business days. If we need anything else, we will reach out.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationPaymentReceivedProps = {
  contactFirstName: "Sam",
  venueName: "The Copper Kettle",
  tierLabel: "Managed curation",
  amount: { amount: 49900, currency: "GBP" },
  shortlistDays: 5,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationPaymentReceivedProps> = {
  id: "curation_payment_received",
  name: "Curation payment received",
  description: "Receipt and next steps once a curation payment settles.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace curation is underway",
  previewText: "Payment received, your shortlist is being prepared.",
  component: CurationPaymentReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
