// Stream: tx (security) · not suppressible. Confirms a completed reset/change
// so a compromised account gets a loud signal to the real owner.

import { EmailShell, H1, P, Small, SupportBlock, InfoBox, Button, Divider } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountPasswordChangedProps {
  firstName: string;
  changedAt: string;
  location?: string;
  device?: string;
  supportUrl?: string;
}

export function AccountPasswordChanged({ firstName, changedAt, location, device, supportUrl }: AccountPasswordChangedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace password was changed">
      <H1>Your password was changed</H1>
      <P>Hi {firstName} — we wanted to confirm your password was updated on {changedAt}.</P>
      {(location || device) && (
        <InfoBox tone="neutral">
          {device ? <>Device: <strong>{device}</strong><br /></> : null}
          {location ? <>Location: <strong>{location}</strong></> : null}
        </InfoBox>
      )}
      <P>If this wasn&rsquo;t you, secure your account now.</P>
      <Button href={supportUrl || "https://wallplace.co.uk/support"}>Contact support</Button>
      <Divider />
      <Small>Wallplace will never ask for your password by email.</Small>
    </EmailShell>
  );
}

export const mock: AccountPasswordChangedProps = {
  firstName: "Maya",
  changedAt: "24 April 2026 at 15:12 BST",
  location: "London, UK",
  device: "Safari on macOS",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountPasswordChangedProps> = {
  id: "account_password_changed",
  name: "Password changed confirmation",
  description: "Fired after a successful password change.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Your Wallplace password was changed",
  previewText: "If this wasn't you, act now.",
  component: AccountPasswordChanged,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
