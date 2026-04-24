// Stream: notify. Both parties. Fires when an install date is locked in.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementScheduledProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  artistName: string;
  scheduledDate: string;
  logisticsNotes?: string;
}

export function PlacementScheduled({ firstName, placementUrl, venueName, artistName, scheduledDate, logisticsNotes }: PlacementScheduledProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`Install scheduled for ${scheduledDate}`}>
      <H1>Install scheduled</H1>
      <P>Hi {firstName} — {artistName} and {venueName} are set for <strong>{scheduledDate}</strong>.</P>
      {logisticsNotes && <InfoBox tone="neutral">{logisticsNotes}</InfoBox>}
      <Button href={placementUrl}>View placement</Button>
    </EmailShell>
  );
}

export const mock: PlacementScheduledProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  scheduledDate: "2 May 2026, 10:00",
  logisticsNotes: "Enter via the side door. Bring fixings for plaster walls.",
};

const entry: TemplateEntry<PlacementScheduledProps> = {
  id: "placement_scheduled",
  name: "Placement scheduled",
  description: "Install date locked in — to both parties.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "Install scheduled for {{scheduledDate}}",
  previewText: "Details inside.",
  component: PlacementScheduled,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
