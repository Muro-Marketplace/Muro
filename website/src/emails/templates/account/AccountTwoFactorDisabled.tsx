// Stream: tx (security). Counterpart to AccountTwoFactorEnabled — an attacker
// disabling 2FA is a strong signal, so the real user must see this.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountTwoFactorDisabledProps {
  firstName: string;
  disabledAt: string;
  reenableUrl: string;
  supportUrl?: string;
}

export function AccountTwoFactorDisabled({ firstName, disabledAt, reenableUrl, supportUrl }: AccountTwoFactorDisabledProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Two-factor authentication was turned off">
      <H1>Two-factor authentication was turned off</H1>
      <P>Hi {firstName} — 2FA was disabled on your account on {disabledAt}.</P>
      <InfoBox tone="warning">
        Your account is now less secure. If you didn&rsquo;t make this change, turn 2FA back on and change your password immediately.
      </InfoBox>
      <Button href={reenableUrl}>Re-enable 2FA</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountTwoFactorDisabledProps = {
  firstName: "Maya",
  disabledAt: "24 April 2026 at 14:52 BST",
  reenableUrl: "https://wallplace.co.uk/account/security/2fa",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountTwoFactorDisabledProps> = {
  id: "account_two_factor_disabled",
  name: "2FA disabled",
  description: "Alerts the account holder that 2FA was turned off.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Two-factor authentication was turned off",
  previewText: "If this wasn't you, act now.",
  component: AccountTwoFactorDisabled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
