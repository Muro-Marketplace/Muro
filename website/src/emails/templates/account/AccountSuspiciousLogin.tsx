// Stream: tx (security). Fired when a new device signs in from an unusual
// location or a token from an old session is detected.

import { EmailShell, H1, P, Button, InfoBox, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountSuspiciousLoginProps {
  firstName: string;
  loginTime: string;
  location?: string;
  device?: string;
  secureAccountUrl: string;
  supportUrl?: string;
}

export function AccountSuspiciousLogin({ firstName, loginTime, location, device, secureAccountUrl, supportUrl }: AccountSuspiciousLoginProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="New sign-in to your Wallplace account">
      <H1>New sign-in detected</H1>
      <P>Hi {firstName} — we noticed a new sign-in to your Wallplace account.</P>
      <InfoBox tone="warning">
        When: <strong>{loginTime}</strong>
        {device ? <><br />Device: <strong>{device}</strong></> : null}
        {location ? <><br />Location: <strong>{location}</strong></> : null}
      </InfoBox>
      <P>If this was you, no action needed. If not, secure your account now:</P>
      <Button href={secureAccountUrl}>Secure my account</Button>
      <Small>Change your password, review your active sessions, and turn on two-factor authentication.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountSuspiciousLoginProps = {
  firstName: "Maya",
  loginTime: "24 April 2026, 02:17 BST",
  location: "Unknown — Lagos, Nigeria",
  device: "Chrome on Windows",
  secureAccountUrl: "https://wallplace.co.uk/account/security",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountSuspiciousLoginProps> = {
  id: "account_suspicious_login",
  name: "Suspicious login alert",
  description: "Unusual device/location sign-in.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "New sign-in to your Wallplace account",
  previewText: "If this wasn't you, secure your account.",
  component: AccountSuspiciousLogin,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
