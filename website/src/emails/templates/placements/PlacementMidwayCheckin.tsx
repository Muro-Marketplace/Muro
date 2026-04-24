// Stream: notify. Halfway through a placement — keeps both parties engaged
// and surfaces interesting data.

import { EmailShell, H1, P, Button, QRScanSummary, StatBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementMidwayCheckinProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  scanCount: number;
  messagesCount: number;
  feedbackUrl: string;
}

export function PlacementMidwayCheckin({ firstName, placementUrl, venueName, scanCount, messagesCount, feedbackUrl }: PlacementMidwayCheckinProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="digests" preview={`Halfway check-in — ${venueName}`}>
      <H1>Halfway there</H1>
      <P>Hi {firstName} — quick look at how the placement is doing at {venueName}.</P>
      <StatBlock
        stats={[
          { label: "QR scans", value: scanCount },
          { label: "Messages exchanged", value: messagesCount },
        ]}
      />
      <QRScanSummary workTitle="Your placement" venueName={venueName} scanCount={scanCount} since="install" />
      <P>Anything we could smooth out?</P>
      <Button href={feedbackUrl}>Share quick feedback</Button>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>
          Open placement
        </a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementMidwayCheckinProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  scanCount: 46,
  messagesCount: 3,
  feedbackUrl: "https://wallplace.co.uk/placements/p_example/feedback",
};

const entry: TemplateEntry<PlacementMidwayCheckinProps> = {
  id: "placement_midway_checkin",
  name: "Placement midway check-in",
  description: "Halfway-through engagement + feedback prompt.",
  stream: "notify",
  persona: "multi",
  category: "digests",
  subject: "Halfway through at {{venueName}}",
  previewText: "A quick look at how it's going.",
  component: PlacementMidwayCheckin,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
