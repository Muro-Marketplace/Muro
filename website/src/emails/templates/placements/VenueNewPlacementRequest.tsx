// Stream: notify. The single most important marketplace-liquidity email.
// Has an in-app equivalent — only email if the venue hasn't responded in-app.

import { EmailShell, H1, P, Button, SecondaryButton, ArtistCard, InfoBox, Small } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist } from "@/emails/data/mockData";

export interface VenueNewPlacementRequestProps {
  firstName: string;
  venueName: string;
  artist: Artist;
  artistProfileUrl: string;
  placementUrl: string;
  requestedWorks: string[];
  proposedTerms: string;
  message?: string;
}

export function VenueNewPlacementRequest({ firstName, venueName, artist, artistProfileUrl, placementUrl, requestedWorks, proposedTerms, message }: VenueNewPlacementRequestProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="placements" preview={`${artist.name} would like to place work at ${venueName}`}>
      <H1>New placement request</H1>
      <P>Hi {firstName} — {artist.name} would like to place work at <strong>{venueName}</strong>.</P>
      <ArtistCard artist={artist} />
      <InfoBox tone="neutral">
        <strong>Works:</strong> {requestedWorks.join(", ")}<br />
        <strong>Terms:</strong> {proposedTerms}
      </InfoBox>
      {message && <P>&ldquo;{message}&rdquo;</P>}
      <div style={{ marginTop: 16 }}>
        <Button href={placementUrl} persona="venue">Review request</Button>{" "}
        <SecondaryButton href={artistProfileUrl} persona="venue">View artist profile</SecondaryButton>
      </div>
      <Small>You can accept, counter, or decline from the request page.</Small>
    </EmailShell>
  );
}

export const mock: VenueNewPlacementRequestProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  artist: mockArtist,
  artistProfileUrl: mockArtist.url,
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  requestedWorks: ["Last Light on Mare Street", "The Flower Seller"],
  proposedTerms: "Paid loan · £120/mo · 10% rev share on QR sales",
  message: "The Mare Street series would sit beautifully against your lobby wall.",
};

const entry: TemplateEntry<VenueNewPlacementRequestProps> = {
  id: "venue_new_placement_request",
  name: "New placement request (to venue)",
  description: "Artist-initiated request lands in venue's inbox.",
  stream: "notify",
  persona: "venue",
  category: "placements",
  subject: "New placement request from {{artistName}}",
  previewText: "Review, counter, or decline.",
  component: VenueNewPlacementRequest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
