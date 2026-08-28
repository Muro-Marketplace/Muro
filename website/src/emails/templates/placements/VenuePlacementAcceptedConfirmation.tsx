// Stream: tx. Mirror for the venue when they accept a venue-initiated
// request and the artist responds, or confirms their own acceptance.
//
// R4.12 (WS5.5): was notify/placements. Acceptance forms the commercial
// arrangement, so this now rides orders_and_payouts (critical always-send);
// sendEmail() enforces it via TEMPLATE_CATEGORY_OVERRIDES.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePlacementAcceptedConfirmationProps {
  firstName: string;
  artistName: string;
  placementUrl: string;
  nextSteps: string[];
}

export function VenuePlacementAcceptedConfirmation({ firstName, artistName, placementUrl, nextSteps }: VenuePlacementAcceptedConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="venue" category="orders_and_payouts" preview={`${artistName} is placing work with you`}>
      <H1>Placement confirmed with {artistName}</H1>
      <P>Hi {firstName}, everything&rsquo;s set. Next up:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {nextSteps.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <Button href={placementUrl} persona="venue">Open placement</Button>
    </EmailShell>
  );
}

export const mock: VenuePlacementAcceptedConfirmationProps = {
  firstName: "Hannah",
  artistName: "Maya Chen",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  nextSteps: [
    "Confirm install date",
    "Share venue logistics with the artist",
    "Review the consignment record together",
  ],
};

const entry: TemplateEntry<VenuePlacementAcceptedConfirmationProps> = {
  id: "venue_placement_accepted_confirmation",
  name: "Placement accepted confirmation (venue)",
  description: "Venue's own copy that a placement is live.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Placement confirmed with {{artistName}}",
  previewText: "What happens next.",
  component: VenuePlacementAcceptedConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
