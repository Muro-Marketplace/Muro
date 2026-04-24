// Stream: tx. Good news counterpart — restrictions lifted.

import { EmailShell, H1, P, Button, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OperationalAccountRestoredProps {
  firstName: string;
  restoredAt: string;
  accountUrl: string;
}

export function OperationalAccountRestored({ firstName, restoredAt, accountUrl }: OperationalAccountRestoredProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace account is back to normal">
      <H1><Badge tone="success">Restored</Badge> <span style={{ marginLeft: 6 }}>You&rsquo;re back in</span></H1>
      <P>Hi {firstName} — your account was restored on {restoredAt}. Everything&rsquo;s back to normal.</P>
      <Button href={accountUrl}>Open account</Button>
    </EmailShell>
  );
}

export const mock: OperationalAccountRestoredProps = {
  firstName: "Maya",
  restoredAt: "24 April 2026",
  accountUrl: "https://wallplace.co.uk/artist-portal",
};

const entry: TemplateEntry<OperationalAccountRestoredProps> = {
  id: "operational_account_restored",
  name: "Account restored",
  description: "Restrictions lifted.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace account is back to normal",
  previewText: "You're restored.",
  component: OperationalAccountRestored,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
