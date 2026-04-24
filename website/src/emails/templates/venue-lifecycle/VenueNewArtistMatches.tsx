// Stream: notify. Ad-hoc match email — sent when the matcher finds strong
// new artists for a venue.

import { EmailShell, H1, P, Button, ArtistCard } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueNewArtistMatchesProps {
  firstName: string;
  venueName: string;
  artists: Artist[];
  browseArtistsUrl: string;
  matchReason: string;
}

export function VenueNewArtistMatches({ firstName, venueName, artists, browseArtistsUrl, matchReason }: VenueNewArtistMatchesProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview={`${artists.length} new artists that would suit ${venueName}`}>
      <H1>{artists.length} artists for {venueName}</H1>
      <P>Hi {firstName} — {matchReason}</P>
      {artists.slice(0, 4).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseArtistsUrl} persona="venue">Browse all artists</Button>
      </div>
    </EmailShell>
  );
}

export const mock: VenueNewArtistMatchesProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  artists: [mockArtist, mockArtistSecondary],
  browseArtistsUrl: "https://wallplace.co.uk/browse",
  matchReason: "All photographers within 3 miles, all currently open to placements.",
};

const entry: TemplateEntry<VenueNewArtistMatchesProps> = {
  id: "venue_new_artist_matches",
  name: "New artist matches",
  description: "Matcher surfaces strong new artists to venues.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "{{count}} new artists that would suit {{venueName}}",
  previewText: "Matched to your preferences.",
  component: VenueNewArtistMatches,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
