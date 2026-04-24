// Stream: notify. Fires ~14 days before the scheduled end date.

import { EmailShell, H1, P, Button, SecondaryButton, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementEndingSoonProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  endDate: string;
  returnInstructionsUrl: string;
  extendPlacementUrl: string;
}

export function PlacementEndingSoon({ firstName, placementUrl, venueName, endDate, returnInstructionsUrl, extendPlacementUrl }: PlacementEndingSoonProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`Placement at ${venueName} ends ${endDate}`}>
      <H1>Your placement ends soon</H1>
      <P>Hi {firstName} — your placement at {venueName} is scheduled to end on <strong>{endDate}</strong>.</P>
      <InfoBox tone="neutral">
        Two options: extend, or arrange collection. Either way, decide early so logistics go smoothly.
      </InfoBox>
      <div>
        <Button href={extendPlacementUrl}>Extend placement</Button>{" "}
        <SecondaryButton href={returnInstructionsUrl}>Return logistics</SecondaryButton>
      </div>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>Open placement</a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementEndingSoonProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  endDate: "8 May 2026",
  returnInstructionsUrl: "https://wallplace.co.uk/placements/p_example?record=open",
  extendPlacementUrl: "https://wallplace.co.uk/placements/p_example?extend=1",
};

const entry: TemplateEntry<PlacementEndingSoonProps> = {
  id: "placement_ending_soon",
  name: "Placement ending soon",
  description: "14-day-out reminder to extend or arrange collection.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "Placement at {{venueName}} ends {{endDate}}",
  previewText: "Extend or arrange collection.",
  component: PlacementEndingSoon,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
