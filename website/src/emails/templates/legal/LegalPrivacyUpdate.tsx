// Stream: tx (legal). Not suppressible.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface LegalPrivacyUpdateProps {
  firstName: string;
  effectiveDate: string;
  summaryChanges: string[];
  privacyUrl: string;
  supportUrl?: string;
}

export function LegalPrivacyUpdate({ firstName, effectiveDate, summaryChanges, privacyUrl, supportUrl }: LegalPrivacyUpdateProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Privacy policy update — effective ${effectiveDate}`}>
      <H1>Our Privacy Policy is changing</H1>
      <P>Hi {firstName} — from <strong>{effectiveDate}</strong>, our Privacy Policy has a few updates.</P>
      <InfoBox tone="neutral">
        <strong>What&rsquo;s different:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {summaryChanges.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </InfoBox>
      <Button href={privacyUrl}>Read full Privacy Policy</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: LegalPrivacyUpdateProps = {
  firstName: "Maya",
  effectiveDate: "1 June 2026",
  summaryChanges: [
    "Added detail on how we store artwork images and for how long",
    "Clarified our use of analytics cookies on /browse",
    "Updated the list of sub-processors (added Inngest, removed Mailchimp)",
  ],
  privacyUrl: "https://wallplace.co.uk/privacy",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<LegalPrivacyUpdateProps> = {
  id: "legal_privacy_update",
  name: "Privacy policy update",
  description: "Legally-required notice of privacy policy changes.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Privacy policy update — effective {{effectiveDate}}",
  previewText: "A summary of what's changed.",
  component: LegalPrivacyUpdate,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
