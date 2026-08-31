// Wallplace Programmes, review fix (Finding 2). The programme client's
// payment confirmation, sent on the SAME first-invoice event as the admin
// alert in src/lib/curation/billing.ts's handleCurationInvoicePaid.
//
// Deliberately NOT CurationPaymentReceived: that template promises a
// shortlist "within N business days", which is the one-off / managed-tier
// checkout flow's language. A programme is quote-first (the requester has
// already seen and accepted the quote via CurationQuoteReady) and is an
// ongoing twelve-month service, not a single delivery, so "shortlist" and a
// day-count are both wrong here. This is the fourth leg of the same
// sequence: CurationEnquiryReceived (brief submitted) -> CurationQuoteReady
// (quote set, payment link sent) -> this (payment settled, programme live).

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CurationProgrammeConfirmedProps {
  contactFirstName: string;
  venueName: string;
  quotedAmount: Money;
  billingInterval: "month" | "quarter";
  /** curation_requests.rotation_cadence: 'quarterly' | 'biannual' | 'none', loosely typed to fail soft on an unexpected value. */
  rotationCadence: string | null;
  termMonths: number;
  supportUrl?: string;
}

/** Matches the FAQ language on the public programmes page (ProgrammesClient.tsx). */
function rotationLabel(cadence: string | null): string {
  switch (cadence) {
    case "quarterly":
      return "Quarterly";
    case "biannual":
      return "Twice a year";
    default:
      return "As agreed";
  }
}

export function CurationProgrammeConfirmed({
  contactFirstName,
  venueName,
  quotedAmount,
  billingInterval,
  rotationCadence,
  termMonths,
  supportUrl,
}: CurationProgrammeConfirmedProps) {
  const interval = billingInterval === "quarter" ? "quarter" : "month";
  return (
    <EmailShell stream="tx" persona="venue" preview="Your Wallplace programme is confirmed">
      <H1>Your programme is confirmed, {contactFirstName}</H1>
      <P>
        Thanks. Your first payment for the Wallplace Programme at {venueName} has gone through,
        and the programme is now confirmed.
      </P>
      <InfoBox tone="info">
        <strong>Venue:</strong> {venueName}
        <br />
        <strong>Programme fee:</strong> {formatMoney(quotedAmount)} per {interval}
        <br />
        <strong>Term:</strong> {termMonths} months, then rolling
        <br />
        <strong>Rotation:</strong> {rotationLabel(rotationCadence)}
      </InfoBox>
      <P>
        We&rsquo;ll be in touch shortly to arrange your first curation and installation. Your term
        runs {termMonths} months to start, then rolls on until either side gives notice, with
        rotation at the cadence agreed above.
      </P>
      <P>
        Every artist whose work hangs on your walls is paid rent from your programme fee, for as
        long as it&rsquo;s up.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationProgrammeConfirmedProps = {
  contactFirstName: "Sam",
  venueName: "Riverside Offices",
  quotedAmount: { amount: 25000, currency: "GBP" },
  billingInterval: "month",
  rotationCadence: "quarterly",
  termMonths: 12,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationProgrammeConfirmedProps> = {
  id: "curation_programme_confirmed",
  name: "Programme payment confirmed",
  description:
    "Sent to a Wallplace Programme client on their first paid invoice: confirms the programme and what happens next.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace programme is confirmed",
  previewText: "Payment received, your programme is confirmed.",
  component: CurationProgrammeConfirmed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
