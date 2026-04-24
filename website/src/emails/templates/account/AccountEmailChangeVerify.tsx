// Stream: tx (security). Sent to the NEW address when a user changes the email
// on their account — the new address must verify before we switch.

import { EmailShell, H1, P, Button, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountEmailChangeVerifyProps {
  firstName: string;
  newEmail: string;
  verifyUrl: string;
  expiresIn: string;
  supportUrl?: string;
}

export function AccountEmailChangeVerify({ firstName, newEmail, verifyUrl, expiresIn, supportUrl }: AccountEmailChangeVerifyProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Confirm your new email: ${newEmail}`}>
      <H1>Confirm your new email</H1>
      <P>Hi {firstName} — we need to confirm this is your address before we update your account.</P>
      <Button href={verifyUrl}>Confirm {newEmail}</Button>
      <Small>This link expires in {expiresIn}. Until you confirm, your sign-in email stays unchanged.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountEmailChangeVerifyProps = {
  firstName: "Maya",
  newEmail: "maya.chen@newdomain.com",
  verifyUrl: "https://wallplace.co.uk/account/email/confirm?t=example",
  expiresIn: "24 hours",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountEmailChangeVerifyProps> = {
  id: "account_email_change_verify",
  name: "Email change verification",
  description: "Sent to the new email when a user changes their sign-in address.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Confirm your new email address",
  previewText: "We need to check this is you.",
  component: AccountEmailChangeVerify,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
