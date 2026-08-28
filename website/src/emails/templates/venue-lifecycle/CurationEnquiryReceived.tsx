// Stream: tx. Acknowledges a bespoke curation enquiry, where no payment is taken
// upfront and a person sends a quote.
//
// K1: replaces notifyCurationCustomerEnquiry from the deleted lib/email.ts,
// which sent hand-written HTML from an unverified domain with no email_events
// row, no suppression check and no idempotency key.

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CurationEnquiryReceivedProps {
  contactFirstName: string;
  venueName: string;
  tierLabel: string;
  responseDays: number;
  supportUrl?: string;
}

export function CurationEnquiryReceived({
  contactFirstName,
  venueName,
  tierLabel,
  responseDays,
  supportUrl,
}: CurationEnquiryReceivedProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview="We have your curation enquiry">
      <H1>Thanks, {contactFirstName}</H1>
      <P>
        We have your curation enquiry for {venueName}. A member of the Wallplace team will be
        in touch within {responseDays} business days with a tailored quote.
      </P>
      <InfoBox tone="info">
        <strong>Venue:</strong> {venueName}
        <br />
        <strong>Service:</strong> {tierLabel}
      </InfoBox>
      <P>
        If you have more context or references to share in the meantime, just reply to this
        email and it reaches the same team.
      </P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationEnquiryReceivedProps = {
  contactFirstName: "Sam",
  venueName: "The Copper Kettle",
  tierLabel: "Bespoke curation",
  responseDays: 2,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationEnquiryReceivedProps> = {
  id: "curation_enquiry_received",
  name: "Curation enquiry received",
  description: "Acknowledgement for a bespoke curation enquiry, before any quote.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace curation enquiry",
  previewText: "We have your enquiry and will send a quote.",
  component: CurationEnquiryReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
