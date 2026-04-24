// Stream: notify. A week after the placement ends, ask for a review.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementReviewRequestProps {
  firstName: string;
  placementUrl: string;
  counterpartyName: string;
  reviewUrl: string;
}

export function PlacementReviewRequest({ firstName, placementUrl, counterpartyName, reviewUrl }: PlacementReviewRequestProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`A quick review for ${counterpartyName}?`}>
      <H1>Leave a note for {counterpartyName}</H1>
      <P>Hi {firstName} — would you share a short review? A few lines goes a long way when they&rsquo;re weighing their next placement.</P>
      <Button href={reviewUrl}>Leave a review</Button>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>Open placement</a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementReviewRequestProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  counterpartyName: "The Curzon",
  reviewUrl: "https://wallplace.co.uk/placements/p_example/review",
};

const entry: TemplateEntry<PlacementReviewRequestProps> = {
  id: "placement_review_request",
  name: "Placement review request",
  description: "Post-placement review prompt.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "A quick review for {{counterpartyName}}?",
  previewText: "A few lines goes a long way.",
  component: PlacementReviewRequest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
