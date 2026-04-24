// ADDITION — mirror of ArtistPlacementDeclined for venue-initiated requests
// the artist declines.
// Stream: notify.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementVenueDeclinedArtistRequestProps {
  firstName: string;
  artistName: string;
  reason?: string;
  browseArtistsUrl: string;
}

export function PlacementVenueDeclinedArtistRequest({ firstName, artistName, reason, browseArtistsUrl }: PlacementVenueDeclinedArtistRequestProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="placements" preview={`${artistName} passed on the placement`}>
      <H1>{artistName} passed this time</H1>
      <P>Hi {firstName} — {artistName} isn&rsquo;t able to place work with you just now.{reason ? ` They said: "${reason}".` : ""}</P>
      <P>Plenty of other artists are looking for the right wall — here are a few that might suit.</P>
      <Button href={browseArtistsUrl} persona="venue">Browse artists</Button>
    </EmailShell>
  );
}

export const mock: PlacementVenueDeclinedArtistRequestProps = {
  firstName: "Hannah",
  artistName: "Maya Chen",
  reason: "My schedule is booked through the summer — would love to revisit in autumn.",
  browseArtistsUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<PlacementVenueDeclinedArtistRequestProps> = {
  id: "placement_venue_declined_artist_request",
  name: "Artist declined venue's request",
  description: "Mirror of artist_placement_declined for venue-initiated requests.",
  stream: "notify",
  persona: "venue",
  category: "placements",
  subject: "{{artistName}} passed on your placement request",
  previewText: "Plenty more artists to discover.",
  component: PlacementVenueDeclinedArtistRequest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
