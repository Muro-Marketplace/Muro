// Stream: tx. F48, the other branch. See the accepted template for why this
// exists: the decline was bell-only too, so an artist waiting on an answer had
// no way to learn there was one without opening the portal.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistArtworkResponseDeclinedProps {
  firstName: string;
  venueName: string;
  requestTitle: string;
  browseRequestsUrl: string;
}

export function ArtistArtworkResponseDeclined({
  firstName,
  venueName,
  requestTitle,
  browseRequestsUrl,
}: ArtistArtworkResponseDeclinedProps) {
  return (
    <EmailShell stream="tx" persona="artist" category="placements" preview={`${venueName} passed on your response`}>
      <H1>{venueName} passed this time</H1>
      <P>Hi {firstName}, {venueName} has passed on your response to &ldquo;{requestTitle}&rdquo;.</P>
      <P>It happens, and it is rarely about the work. There are other briefs open right now.</P>
      <Button href={browseRequestsUrl} persona="artist">See open briefs</Button>
      <Small>You are getting this because you responded to this venue&rsquo;s brief on Wallplace.</Small>
    </EmailShell>
  );
}

export const mock: ArtistArtworkResponseDeclinedProps = {
  firstName: "Maya",
  venueName: "The Copper Kettle",
  requestTitle: "Coffee shop wall",
  browseRequestsUrl: "https://wallplace.co.uk/artist-portal/artwork-requests",
};

const entry: TemplateEntry<ArtistArtworkResponseDeclinedProps> = {
  id: "artist_artwork_response_declined",
  name: "Artwork request response declined (to artist)",
  description: "Soft decline of the artist's response to a venue brief, with a nudge to other briefs.",
  stream: "tx",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} passed on your response",
  previewText: "A gentle note, plus other briefs that are still open.",
  component: ArtistArtworkResponseDeclined,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
