// Stream: tx (legal / GDPR). Not suppressible.

import { EmailShell, H1, P, Button, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountDataExportReadyProps {
  firstName: string;
  downloadUrl: string;
  expiresAt: string;
  supportUrl?: string;
}

export function AccountDataExportReady({ firstName, downloadUrl, expiresAt, supportUrl }: AccountDataExportReadyProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace data export is ready">
      <H1>Your data export is ready</H1>
      <P>Hi {firstName} — the data export you requested is ready to download.</P>
      <Button href={downloadUrl}>Download your data</Button>
      <Small>This link expires on {expiresAt}. After that you&rsquo;ll need to request a new export.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountDataExportReadyProps = {
  firstName: "Maya",
  downloadUrl: "https://wallplace.co.uk/account/export/abc123",
  expiresAt: "1 May 2026",
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
  previewText: "Download your data — link expires soon.",
  component: AccountDataExportReady,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
