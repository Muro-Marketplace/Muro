// Stream: notify. Fires when the matching engine finds venues that fit
// an artist's style + location.

import { EmailShell, H1, P, Button, VenueCard, Small } from "@/emails/_components";
import type { Venue } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockVenue, mockVenueSecondary } from "@/emails/data/mockData";

export interface ArtistNewVenueMatchProps {
  firstName: string;
  matchedVenues: Venue[];
  discoverVenuesUrl: string;
  matchReason: string;
}

export function ArtistNewVenueMatch({ firstName, matchedVenues, discoverVenuesUrl, matchReason }: ArtistNewVenueMatchProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview={`${matchedVenues.length} venues near you looking for your kind of work`}>
      <H1>{matchedVenues.length} new matches for you</H1>
      <P>Hi {firstName} — we found a few venues that suit your work. {matchReason}</P>
      {matchedVenues.slice(0, 4).map((v) => <VenueCard key={v.id} venue={v} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={discoverVenuesUrl} persona="artist">See all matches</Button>
      </div>
      <Small>We only send these when the matches are strong. No noise.</Small>
    </EmailShell>
  );
}

export const mock: ArtistNewVenueMatchProps = {
  firstName: "Maya",
  matchedVenues: [mockVenue, mockVenueSecondary],
  discoverVenuesUrl: "https://wallplace.co.uk/spaces-looking-for-art",
  matchReason: "All looking for photography in East/Central London.",
};

const entry: TemplateEntry<ArtistNewVenueMatchProps> = {
  id: "artist_new_venue_match",
  name: "New venue match",
  description: "Matching engine surfaces venues to artists.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "{{count}} venues near you looking for your work",
  previewText: "Here's a few we think would fit.",
  component: ArtistNewVenueMatch,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
