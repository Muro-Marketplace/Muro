// Stream: notify. Delightful first-scan moment — fires once per QR code.

import { EmailShell, H1, P, Button, QRScanSummary } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistFirstQrScanProps {
  firstName: string;
  workTitle: string;
  venueName: string;
  qrStatsUrl: string;
  scanTime: string;
}

export function ArtistFirstQrScan({ firstName, workTitle, venueName, qrStatsUrl, scanTime }: ArtistFirstQrScanProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview={`Your work was just scanned at ${venueName}`}>
      <H1>Someone just scanned your work</H1>
      <P>Hi {firstName} — the first scan of <strong>{workTitle}</strong> at {venueName} came in at {scanTime}.</P>
      <QRScanSummary workTitle={workTitle} venueName={venueName} scanCount={1} since="install" />
      <Button href={qrStatsUrl} persona="artist">See scan stats</Button>
    </EmailShell>
  );
}

export const mock: ArtistFirstQrScanProps = {
  firstName: "Maya",
  workTitle: "Last Light on Mare Street",
  venueName: "The Curzon",
  qrStatsUrl: "https://wallplace.co.uk/artist-portal/labels",
  scanTime: "24 April 2026, 16:02 BST",
};

const entry: TemplateEntry<ArtistFirstQrScanProps> = {
  id: "artist_first_qr_scan",
  name: "First QR scan",
  description: "A moment worth celebrating — first interaction with a piece.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Your work was just scanned at {{venueName}}",
  previewText: "The first scan is always a thrill.",
  component: ArtistFirstQrScan,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
