// Stream: tx (legal). Final "your account is gone" receipt — sent after the
// delayed deletion actually executes.

import { EmailShell, H1, P, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountDeletionConfirmedProps {
  firstName: string;
  supportUrl?: string;
}

export function AccountDeletionConfirmed({ firstName, supportUrl }: AccountDeletionConfirmedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace account has been deleted">
      <H1>Your account has been deleted</H1>
      <P>Hi {firstName} — your Wallplace account and associated data have been permanently removed.</P>
      <P>Thank you for being part of Wallplace. If you ever change your mind, you&rsquo;re welcome to join again — you&rsquo;ll need to sign up as a new member.</P>
      <Small>We&rsquo;ve retained only the transaction records we&rsquo;re legally required to keep. Those have been anonymised where possible.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountDeletionConfirmedProps = {
  firstName: "Maya",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountDeletionConfirmedProps> = {
  id: "account_deletion_confirmed",
  name: "Account deletion confirmed",
  description: "Sent after deletion executes.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace account has been deleted",
  previewText: "Your data has been permanently removed.",
  component: AccountDeletionConfirmed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
