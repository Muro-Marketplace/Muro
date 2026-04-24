// Stream: tx. Formal policy warning with appeal path.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OperationalPolicyViolationWarningProps {
  firstName: string;
  issueSummary: string;
  actionRequired: string;
  appealUrl: string;
  supportUrl?: string;
}

export function OperationalPolicyViolationWarning({ firstName, issueSummary, actionRequired, appealUrl, supportUrl }: OperationalPolicyViolationWarningProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="An issue with your Wallplace account">
      <H1>An issue with your account</H1>
      <P>Hi {firstName} — we wanted to flag something that doesn&rsquo;t sit right with our policies.</P>
      <InfoBox tone="warning">
        <strong>Issue:</strong> {issueSummary}
        <br /><br />
        <strong>Action required:</strong> {actionRequired}
      </InfoBox>
      <P>If you think we&rsquo;ve got this wrong, tell us — we&rsquo;ll review.</P>
      <Button href={appealUrl}>Appeal / reply</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OperationalPolicyViolationWarningProps = {
  firstName: "Maya",
  issueSummary: "One of your uploaded works appears to be a close copy of another artist's piece on the platform.",
  actionRequired: "Either remove the piece or reply with evidence of originality within 7 days.",
  appealUrl: "https://wallplace.co.uk/account/appeal",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OperationalPolicyViolationWarningProps> = {
  id: "operational_policy_violation_warning",
  name: "Policy violation warning",
  description: "Formal policy flag with appeal path.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "An issue with your Wallplace account",
  previewText: "Action required within 7 days.",
  component: OperationalPolicyViolationWarning,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
