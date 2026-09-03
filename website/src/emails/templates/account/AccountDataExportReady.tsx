// Stream: tx (legal / GDPR). Not suppressible.
//
// Sent from GET /api/account/export once the dump has been built. The export is
// generated on demand and served straight back as a download, so there is no
// stored file and no link that expires: `downloadUrl` points at the account
// export page, where a fresh copy can be generated any time, and `expiresAt`
// is optional for a sender that does have a time-limited link.

import { EmailShell, H1, P, Button, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountDataExportReadyProps {
  firstName: string;
  downloadUrl: string;
  /** When set, the link is described as expiring on this date. Leave unset for a link that does not. */
  expiresAt?: string;
  supportUrl?: string;
}

export function AccountDataExportReady({ firstName, downloadUrl, expiresAt, supportUrl }: AccountDataExportReadyProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace data export is ready">
      <H1>Your data export is ready</H1>
      <P>Hi {firstName}, the data export you requested is ready to download.</P>
      <Button href={downloadUrl}>Download your data</Button>
      {expiresAt ? (
        <Small>This link expires on {expiresAt}. After that you&rsquo;ll need to request a new export.</Small>
      ) : (
        <Small>You can generate a fresh export from your account page at any time.</Small>
      )}
      <Small>If you didn&rsquo;t request this, contact support straight away.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountDataExportReadyProps = {
  firstName: "Maya",
  downloadUrl: "https://wallplace.co.uk/account/export",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountDataExportReadyProps> = {
  id: "account_data_export_ready",
  name: "Data export ready",
  description: "GDPR / DSR data export download link.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace data export is ready",
  previewText: "Download your data, link expires soon.",
  component: AccountDataExportReady,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
