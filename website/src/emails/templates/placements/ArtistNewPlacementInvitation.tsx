// Stream: notify. The mirror of VenueNewPlacementRequest: a VENUE has invited an
// artist to place work, so the artist is the recipient.
//
// K1: this is the template whose absence kept a legacy fallback alive. Both
// placements/route.ts and messages/route.ts sent the polished
// VenueNewPlacementRequest for artist-initiated requests and dropped to
// notifyPlacementRequest's hand-written HTML for venue-initiated ones, with a
// comment saying "we don't yet have a matching polished template". The two
// halves of one event were reaching people through two different email systems,
// only one of which had suppression, preferences and an audit trail.

import { EmailShell, H1, P, Button, VenueCard, InfoBox, Small } from "@/emails/_components";
import type { Venue } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockVenue } from "@/emails/data/mockData";

export interface ArtistNewPlacementInvitationProps {
  firstName: string;
  venue: Venue;
  placementUrl: string;
  requestedWorks: string[];
  proposedTerms: string;
  message?: string;
}

export function ArtistNewPlacementInvitation({
  firstName,
  venue,
  placementUrl,
  requestedWorks,
  proposedTerms,
  message,
}: ArtistNewPlacementInvitationProps) {
  return (
    <EmailShell
      stream="notify"
      persona="artist"
      category="placements"
      preview={`${venue.name} would like to display your work`}
    >
      <H1>A venue wants your work on their wall</H1>
      <P>
        Hi {firstName}, <strong>{venue.name}</strong> would like to display your work.
      </P>
      <VenueCard venue={venue} />
      <InfoBox tone="neutral">
        <strong>Works:</strong> {requestedWorks.join(", ")}
        <br />
        <strong>Terms:</strong> {proposedTerms}
      </InfoBox>
      {message && <P>&ldquo;{message}&rdquo;</P>}
      <div style={{ marginTop: 16 }}>
        <Button href={placementUrl} persona="artist">Review request</Button>
      </div>
      <Small>You can accept, counter, or decline from the request page.</Small>
    </EmailShell>
  );
}

export const mock: ArtistNewPlacementInvitationProps = {
  firstName: "Maya",
  venue: mockVenue,
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  requestedWorks: ["Last Light on Mare Street"],
  proposedTerms: "Paid loan · £120/mo · 10% rev share on sales from the wall",
  message: "We think this would sit beautifully in our front room.",
};

const entry: TemplateEntry<ArtistNewPlacementInvitationProps> = {
  id: "artist_new_placement_invitation",
  name: "New placement invitation (to artist)",
  description: "Venue-initiated request lands in the artist's inbox.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} would like to display your work",
  previewText: "Review, counter, or decline.",
  component: ArtistNewPlacementInvitation,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
