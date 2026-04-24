// Stream: tx (legal). Not suppressible.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface LegalTermsUpdateProps {
  firstName: string;
  effectiveDate: string;
  summaryChanges: string[];
  termsUrl: string;
  supportUrl?: string;
}

export function LegalTermsUpdate({ firstName, effectiveDate, summaryChanges, termsUrl, supportUrl }: LegalTermsUpdateProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Terms update — effective ${effectiveDate}`}>
      <H1>We&rsquo;re updating our Terms</H1>
      <P>Hi {firstName} — our Terms of Service change on <strong>{effectiveDate}</strong>. No action needed from you — we wanted to summarise what&rsquo;s different.</P>
      <InfoBox tone="neutral">
        <strong>What&rsquo;s changed:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {summaryChanges.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </InfoBox>
      <Button href={termsUrl}>Read full Terms</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: LegalTermsUpdateProps = {
  firstName: "Maya",
  effectiveDate: "1 June 2026",
  summaryChanges: [
    "Clarified refund timing on disputed orders (still 14 days, worded more clearly)",
    "Added explicit wording for artist-initiated placement cancellations",
    "Updated dispute resolution contact details",
  ],
  termsUrl: "https://wallplace.co.uk/terms",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<LegalTermsUpdateProps> = {
  id: "legal_terms_update",
  name: "Terms of service update",
  description: "Legally-required notice of terms changes.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Updates to the Wallplace Terms — effective {{effectiveDate}}",
  previewText: "A summary of what's changed.",
  component: LegalTermsUpdate,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
