// Stream: tx (legal) · not suppressible. Gives the user a window to cancel.
//
// Sent from POST /api/account/delete when the request has been accepted but
// the erasure could not be completed in the same request and support has to
// finish it by hand (the C14c retained path). That is the only state in which
// "scheduled, and you can still cancel" is true: the ordinary path erases the
// account immediately and sends AccountDeletionConfirmed instead. There is no
// date in that state, so `deletionDate` is optional and the copy says what
// actually happens next when it is missing.

import { EmailShell, H1, P, SecondaryButton, Small, SupportBlock, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountDeletionRequestedProps {
  firstName: string;
  /** When known. Without it the copy says the removal follows once support has processed the request. */
  deletionDate?: string;
  cancelDeletionUrl: string;
  supportUrl?: string;
}

export function AccountDeletionRequested({ firstName, deletionDate, cancelDeletionUrl, supportUrl }: AccountDeletionRequestedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your account is scheduled for deletion">
      <H1>Account deletion scheduled</H1>
      <P>Hi {firstName}, we received your request to delete your Wallplace account.</P>
      <InfoBox tone="warning">
        {deletionDate ? (
          <>Your account and data will be permanently removed on <strong>{deletionDate}</strong>. You can cancel any time before then.</>
        ) : (
          <>Your account and data will be permanently removed once our support team has finished processing the request. You can cancel any time before then.</>
        )}
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
