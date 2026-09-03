// Stream: notify. The single most important marketplace-liquidity email.
// Has an in-app equivalent, only email if the venue hasn't responded in-app.

import { Img, Link } from "@react-email/components";
import { EmailShell, H1, P, Button, SecondaryButton, ArtistCard, InfoBox, Small, TextLink, theme } from "@/emails/_components";
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
  /** Public URL of the capture the artist made on one of the venue's public
      walls (src/lib/placements/wall-proposals.ts). Shown with `wallName`;
      absent when the request was not laid out on a wall. */
  wallPreviewUrl?: string;
  wallName?: string;
}

export function VenueNewPlacementRequest({ firstName, venueName, artist, artistProfileUrl, placementUrl, requestedWorks, proposedTerms, message, wallPreviewUrl, wallName }: VenueNewPlacementRequestProps) {
  const showProposal = !!wallPreviewUrl && !!wallName;
  return (
    <EmailShell stream="notify" persona="venue" category="placements" preview={`${artist.name} would like to place work at ${venueName}`}>
      <H1>New placement request</H1>
      <P>Hi {firstName}, {artist.name} would like to place work at <strong>{venueName}</strong>.</P>
      <ArtistCard artist={artist} />
      <InfoBox tone="neutral">
        <strong>Works:</strong> {requestedWorks.join(", ")}<br />
        <strong>Terms:</strong> {proposedTerms}
      </InfoBox>
      {showProposal && (
        <div style={{ margin: "16px 0" }}>
          <Link href={placementUrl}>
            <Img
              src={wallPreviewUrl}
              alt={`${artist.name}'s work previewed on your ${wallName} wall`}
              width={560}
              style={{ display: "block", width: "100%", maxWidth: 560, height: "auto", borderRadius: 3, border: `1px solid ${theme.border}` }}
            />
          </Link>
          <Small>
            {`How ${artist.name} pictured it on your ${wallName} wall.`}{" "}
            <TextLink href={placementUrl} persona="venue">Open the request</TextLink>
          </Small>
        </div>
      )}
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
  proposedTerms: "Paid loan · £120/mo · 10% rev share on sales from the wall",
  message: "The Mare Street series would sit beautifully against your lobby wall.",
  wallPreviewUrl: "https://wallplace.co.uk/previews/curzon-lobby-mare-street.webp",
  wallName: "Lobby",
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
