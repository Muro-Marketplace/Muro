// Stream: notify. Confirmation receipt to the artist that their request
// was sent. Closes the "did it go through?" loop.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPlacementRequestSentProps {
  firstName: string;
  venueName: string;
  placementUrl: string;
  requestedWorks: string[];
  proposedTerms: string;
}

export function ArtistPlacementRequestSent({ firstName, venueName, placementUrl, requestedWorks, proposedTerms }: ArtistPlacementRequestSentProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview={`Request sent to ${venueName}`}>
      <H1>Request sent to {venueName}</H1>
      <P>Hi {firstName} — we&rsquo;ve delivered your request. We&rsquo;ll let you know as soon as {venueName} responds.</P>
      <InfoBox tone="neutral">
        <strong>Works:</strong> {requestedWorks.join(", ")}<br />
        <strong>Terms you proposed:</strong> {proposedTerms}
      </InfoBox>
      <Button href={placementUrl} persona="artist">View request</Button>
    </EmailShell>
  );
}

export const mock: ArtistPlacementRequestSentProps = {
  firstName: "Maya",
  venueName: "The Curzon",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  requestedWorks: ["Last Light on Mare Street"],
  proposedTerms: "Paid loan · £120/mo",
};

const entry: TemplateEntry<ArtistPlacementRequestSentProps> = {
  id: "artist_placement_request_sent",
  name: "Placement request sent (to artist)",
  description: "Artist's own confirmation that their request went out.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "Request sent to {{venueName}}",
  previewText: "We'll email you the moment they respond.",
  component: ArtistPlacementRequestSent,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
