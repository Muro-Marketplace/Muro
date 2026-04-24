// Stream: tx (security). Sent to the account's current email whenever 2FA is
// switched on, so a silent compromise leaves a trail.

import { EmailShell, H1, P, Small, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountTwoFactorEnabledProps {
  firstName: string;
  method: "authenticator_app" | "sms";
  enabledAt: string;
  supportUrl?: string;
}

export function AccountTwoFactorEnabled({ firstName, method, enabledAt, supportUrl }: AccountTwoFactorEnabledProps) {
  const methodLabel = method === "authenticator_app" ? "an authenticator app" : "text message";
  return (
    <EmailShell stream="tx" persona="multi" preview="Two-factor authentication is now on">
      <H1>Two-factor authentication is on</H1>
      <P>Hi {firstName} — 2FA was enabled on your account on {enabledAt} using {methodLabel}.</P>
      <InfoBox tone="info">
        From now on, you&rsquo;ll need a code from {methodLabel} when signing in on a new device.
      </InfoBox>
      <Small>If this wasn&rsquo;t you, contact support immediately.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountTwoFactorEnabledProps = {
  firstName: "Maya",
  method: "authenticator_app",
  enabledAt: "24 April 2026 at 09:03 BST",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountTwoFactorEnabledProps> = {
  id: "account_two_factor_enabled",
  name: "2FA enabled",
  description: "Confirms two-factor authentication is on.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Two-factor authentication is now on",
  previewText: "Your account is more secure.",
  component: AccountTwoFactorEnabled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
