// Stream: tx (security) · not suppressible · no in-app equivalent.
// Sent on every signup and on manual re-send. Rate-limit 1/2min per address
// at the sender level, not here.

import { EmailShell, H1, P, Button, Small, SupportBlock, Divider } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountEmailVerificationProps {
  firstName: string;
  verificationUrl: string;
  expiresIn: string;
  supportUrl?: string;
}

export function AccountEmailVerification({ firstName, verificationUrl, expiresIn, supportUrl }: AccountEmailVerificationProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Confirm your email to activate your Wallplace account`}>
      <H1>Welcome to Wallplace, {firstName}</H1>
      <P>One last step — tap below to confirm your email and unlock your account.</P>
      <Button href={verificationUrl}>Confirm email</Button>
      <Small>This link expires in {expiresIn}. If you didn&rsquo;t create an account, you can safely ignore this email.</Small>
      <Divider />
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountEmailVerificationProps = {
  firstName: "Maya",
  verificationUrl: "https://wallplace.co.uk/verify?t=example",
  expiresIn: "24 hours",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountEmailVerificationProps> = {
  id: "account_email_verification",
  name: "Email verification",
  description: "Sent on signup to confirm the email address.",
  stream: "tx",
  persona: "multi",
  category: "security",
  subject: "Confirm your Wallplace account",
  previewText: "Tap the button to finish signing up.",
  component: AccountEmailVerification,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
