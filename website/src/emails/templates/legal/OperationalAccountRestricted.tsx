// Stream: tx. Stronger-than-warning — the account is in a limited state.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OperationalAccountRestrictedProps {
  firstName: string;
  reason: string;
  restrictionDetails: string[];
  appealUrl: string;
  supportUrl?: string;
}

export function OperationalAccountRestricted({ firstName, reason, restrictionDetails, appealUrl, supportUrl }: OperationalAccountRestrictedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace account has been restricted">
      <H1>Your account is restricted</H1>
      <P>Hi {firstName} — we&rsquo;ve placed restrictions on your Wallplace account.</P>
      <InfoBox tone="danger">
        <strong>Reason:</strong> {reason}
      </InfoBox>
      <P><strong>What this means:</strong></P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {restrictionDetails.map((d) => <li key={d}>{d}</li>)}
      </ul>
      <Button href={appealUrl}>Appeal this decision</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OperationalAccountRestrictedProps = {
  firstName: "Maya",
  reason: "Repeated policy violations around artwork originality.",
  restrictionDetails: [
    "You can't upload new works while restricted",
    "Existing placements continue as normal",
    "Payouts are paused until the appeal is resolved",
  ],
  appealUrl: "https://wallplace.co.uk/account/appeal",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OperationalAccountRestrictedProps> = {
  id: "operational_account_restricted",
  name: "Account restricted",
  description: "Account put into a limited state.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace account has been restricted",
  previewText: "Appeal path inside.",
  component: OperationalAccountRestricted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
