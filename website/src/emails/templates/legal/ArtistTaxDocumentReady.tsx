// Stream: tx (legal / tax). Not suppressible.

import { EmailShell, H1, P, Button, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistTaxDocumentReadyProps {
  firstName: string;
  taxYear: string;
  documentUrl: string;
  supportUrl?: string;
}

export function ArtistTaxDocumentReady({ firstName, taxYear, documentUrl, supportUrl }: ArtistTaxDocumentReadyProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Your ${taxYear} Wallplace tax summary`}>
      <H1>Your {taxYear} tax summary</H1>
      <P>Hi {firstName} — your Wallplace income summary for {taxYear} is ready. Download for your records or your accountant.</P>
      <Button href={documentUrl} persona="artist">Download summary</Button>
      <Small>This is a summary of your earnings on the platform. Check with a qualified accountant for how to report it.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistTaxDocumentReadyProps = {
  firstName: "Maya",
  taxYear: "2025/26",
  documentUrl: "https://wallplace.co.uk/artist-portal/billing/tax/2025-26.pdf",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistTaxDocumentReadyProps> = {
  id: "artist_tax_document_ready",
  name: "Tax document ready",
  description: "Annual tax summary for artists.",
  stream: "tx",
  persona: "artist",
  category: "legal",
  subject: "Your {{taxYear}} Wallplace tax summary",
  previewText: "Download for your records.",
  component: ArtistTaxDocumentReady,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
