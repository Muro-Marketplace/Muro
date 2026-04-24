// Stream: tx (legal) · not suppressible. Gives the user a window to cancel.

import { EmailShell, H1, P, Button, SecondaryButton, Small, SupportBlock, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountDeletionRequestedProps {
  firstName: string;
  deletionDate: string;
  cancelDeletionUrl: string;
  supportUrl?: string;
}

export function AccountDeletionRequested({ firstName, deletionDate, cancelDeletionUrl, supportUrl }: AccountDeletionRequestedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your account is scheduled for deletion">
      <H1>Account deletion scheduled</H1>
      <P>Hi {firstName} — we received your request to delete your Wallplace account.</P>
      <InfoBox tone="warning">
        Your account and data will be permanently removed on <strong>{deletionDate}</strong>. You can cancel any time before then.
      </InfoBox>
      <SecondaryButton href={cancelDeletionUrl}>Cancel deletion</SecondaryButton>
      <Small>Deletions are irreversible. Your artwork, placements, messages, and orders will be removed. Tax records we&rsquo;re legally required to retain are kept anonymously.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountDeletionRequestedProps = {
  firstName: "Maya",
  deletionDate: "8 May 2026",
  cancelDeletionUrl: "https://wallplace.co.uk/account/cancel-deletion?t=example",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountDeletionRequestedProps> = {
  id: "account_deletion_requested",
  name: "Account deletion requested",
  description: "Confirms a pending deletion and offers a cancel path.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace account is scheduled for deletion",
  previewText: "Cancel any time before it's final.",
  component: AccountDeletionRequested,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
