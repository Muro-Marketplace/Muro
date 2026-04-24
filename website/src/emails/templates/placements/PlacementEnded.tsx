// Stream: notify. Placement has ended — logistics + review prompt.

import { EmailShell, H1, P, Button, SecondaryButton } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementEndedProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  returnInstructionsUrl: string;
  reviewUrl: string;
}

export function PlacementEnded({ firstName, placementUrl, venueName, returnInstructionsUrl, reviewUrl }: PlacementEndedProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`Your placement at ${venueName} ended — last steps`}>
      <H1>Placement at {venueName} ended</H1>
      <P>Hi {firstName} — the placement has wrapped up. Two last things:</P>
      <ol style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        <li>Arrange or confirm collection of the work.</li>
        <li>Leave a short review so the other party can build their reputation.</li>
      </ol>
      <div>
        <Button href={returnInstructionsUrl}>Return logistics</Button>{" "}
        <SecondaryButton href={reviewUrl}>Leave a review</SecondaryButton>
      </div>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>Open placement</a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementEndedProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  returnInstructionsUrl: "https://wallplace.co.uk/placements/p_example?record=open",
  reviewUrl: "https://wallplace.co.uk/placements/p_example/review",
};

const entry: TemplateEntry<PlacementEndedProps> = {
  id: "placement_ended",
  name: "Placement ended",
  description: "Placement closed — collection + review CTAs.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "Your placement at {{venueName}} has ended",
  previewText: "Two last steps to wrap it up.",
  component: PlacementEnded,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
