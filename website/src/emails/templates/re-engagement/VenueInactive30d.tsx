// Stream: news. 30-day venue nudge listing artists who joined while they were away.
//
// H22/H26. The heading said "Four artists near you" and the cron passed
// `suggestedArtists: []`, so the email promised four artists and listed none,
// every time. Two things changed. The count in the heading is now the length of
// the list, so it cannot over-promise. And "near you" is gone, because there is
// no geo matching behind it: what the cron can actually prove is who signed up
// recently, which is what this now says.

import { EmailShell, H1, P, Button, ArtistCard } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueInactive30dProps {
  firstName: string;
  venueName: string;
  /** Never empty at send time: the cron skips the email when it has no artists. */
  suggestedArtists: Artist[];
  browseArtistsUrl: string;
}

export function VenueInactive30d({ firstName, venueName, suggestedArtists, browseArtistsUrl }: VenueInactive30dProps) {
  const shown = suggestedArtists.slice(0, 4);
  return (
    <EmailShell stream="news" persona="venue" category="tips" preview={`New artists for ${venueName}`}>
      <H1>{shown.length === 1 ? "A new artist to see" : `${shown.length} new artists to see`}</H1>
      <P>Hi {firstName}, while you&rsquo;ve been away, {shown.length === 1 ? "an artist" : "some artists"} worth {venueName}&rsquo;s wall signed up.</P>
      {shown.map((a) => <ArtistCard key={a.id} artist={a} />)}
      <Button href={browseArtistsUrl} persona="venue">Browse artists</Button>
    </EmailShell>
  );
}

export const mock: VenueInactive30dProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  suggestedArtists: [mockArtist, mockArtistSecondary],
  browseArtistsUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<VenueInactive30dProps> = {
  id: "venue_inactive_30d",
  name: "Venue inactive 30d",
  description: "Surface artists who joined while the venue was away.",
  stream: "news",
  persona: "venue",
  category: "tips",
  subject: "New artists for {{venueName}}",
  previewText: "A few you might like.",
  component: VenueInactive30d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
