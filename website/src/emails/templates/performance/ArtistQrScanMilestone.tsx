// Stream: notify. Fires at 10 / 50 / 100 / 500 / 1000 scans per piece.

import { EmailShell, H1, P, Button, QRScanSummary } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistQrScanMilestoneProps {
  firstName: string;
  milestone: number;
  workTitle: string;
  venueName: string;
  qrStatsUrl: string;
}

export function ArtistQrScanMilestone({ firstName, milestone, workTitle, venueName, qrStatsUrl }: ArtistQrScanMilestoneProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview={`${milestone} scans on ${workTitle}`}>
      <H1>{milestone} scans on {workTitle}</H1>
      <P>Hi {firstName} — that&rsquo;s {milestone.toLocaleString()} people who&rsquo;ve tapped the QR next to your work at {venueName}.</P>
      <QRScanSummary workTitle={workTitle} venueName={venueName} scanCount={milestone} />
      <Button href={qrStatsUrl} persona="artist">See all stats</Button>
    </EmailShell>
  );
}

export const mock: ArtistQrScanMilestoneProps = {
  firstName: "Maya",
  milestone: 100,
  workTitle: "Last Light on Mare Street",
  venueName: "The Curzon",
  qrStatsUrl: "https://wallplace.co.uk/artist-portal/labels",
};

const entry: TemplateEntry<ArtistQrScanMilestoneProps> = {
  id: "artist_qr_scan_milestone",
  name: "QR scan milestone",
  description: "Celebrates 10 / 50 / 100 / 500 / 1000 scans.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "{{milestone}} scans on {{workTitle}}",
  previewText: "A small moment worth noting.",
  component: ArtistQrScanMilestone,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
