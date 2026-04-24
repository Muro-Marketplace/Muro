// Stream: tx (security) · not suppressible · no in-app equivalent.

import { EmailShell, H1, P, Button, Small, SupportBlock, Divider } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountPasswordResetProps {
  firstName: string;
  resetUrl: string;
  expiresIn: string;
  supportUrl?: string;
}

export function AccountPasswordReset({ firstName, resetUrl, expiresIn, supportUrl }: AccountPasswordResetProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Reset your Wallplace password">
      <H1>Reset your password</H1>
      <P>Hi {firstName} — use the button below to choose a new password.</P>
      <Button href={resetUrl}>Reset password</Button>
      <Small>This link expires in {expiresIn}. If you didn&rsquo;t request a reset, ignore this email and your password stays the same.</Small>
      <Divider />
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountPasswordResetProps = {
  firstName: "Maya",
  resetUrl: "https://wallplace.co.uk/reset?t=example",
  expiresIn: "60 minutes",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountPasswordResetProps> = {
  id: "account_password_reset",
  name: "Password reset",
  description: "User-initiated password reset.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Reset your Wallplace password",
  previewText: "Choose a new password to get back in.",
  component: AccountPasswordReset,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
