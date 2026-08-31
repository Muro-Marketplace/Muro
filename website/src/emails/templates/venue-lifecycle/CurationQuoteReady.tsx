// Stream: tx. The other half of the quote-first curation flow: once an admin
// has priced an `awaiting_quote` programme request (Task 4's admin quote
// route), the requester gets this email with a link to set up payment. There
// is no "pay now" step at enquiry time for programmes (curation-tiers.ts:
// quoted only, ever), so this is the first and only email that can charge
// anything.
//
// Sibling of CurationEnquiryReceived (sent at enquiry time, no amount yet)
// and CurationPaymentReceived (sent once payment has actually settled). This
// one sits between them: a real quote exists, nothing has been charged yet.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CurationQuoteReadyProps {
  contactFirstName: string;
  venueName: string;
  quotedAmount: Money;
  billingInterval: "month" | "quarter";
  checkoutUrl: string;
  supportUrl?: string;
}

export function CurationQuoteReady({
  contactFirstName,
  venueName,
  quotedAmount,
  billingInterval,
  checkoutUrl,
  supportUrl,
}: CurationQuoteReadyProps) {
  const cadence = billingInterval === "quarter" ? "quarter" : "month";
  return (
    <EmailShell stream="tx" persona="venue" preview="Your Wallplace programme quote is ready">
      <H1>Your programme quote is ready, {contactFirstName}</H1>
      <P>
        Here is the quote for {venueName}&rsquo;s Wallplace programme. Set up payment when you
        are ready and we will start scheduling curation and installation.
      </P>
      <InfoBox tone="info">
        <strong>Venue:</strong> {venueName}
        <br />
        <strong>Quote:</strong> {formatMoney(quotedAmount)} per {cadence}
      </InfoBox>
      <Button href={checkoutUrl}>Set up payment</Button>
      <P>
        This sets up your recurring payment by card on Stripe&rsquo;s secure checkout. Nothing is
        charged until you confirm there.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationQuoteReadyProps = {
  contactFirstName: "Sam",
  venueName: "The Copper Kettle",
  quotedAmount: { amount: 15000, currency: "GBP" },
  billingInterval: "month",
  checkoutUrl: "https://wallplace.co.uk/api/curation/cr-123/checkout",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationQuoteReadyProps> = {
  id: "curation_quote_ready",
  name: "Programme quote ready",
  description: "Sent once an admin has priced an awaiting-quote programme request, with a link to pay.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace programme quote is ready",
  previewText: "Your quote is ready. Set up payment to get started.",
  component: CurationQuoteReady,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
