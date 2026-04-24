// Stream: news. 30-day venue nudge with local matches.

import { EmailShell, H1, P, Button, ArtistCard } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueInactive30dProps {
  firstName: string;
  venueName: string;
  suggestedArtists: Artist[];
  browseArtistsUrl: string;
}

export function VenueInactive30d({ firstName, venueName, suggestedArtists, browseArtistsUrl }: VenueInactive30dProps) {
  return (
    <EmailShell stream="news" persona="venue" category="tips" preview={`New artists for ${venueName}`}>
      <H1>Four artists near you</H1>
      <P>Hi {firstName} — while you&rsquo;ve been away, a few artists worth {venueName}&rsquo;s wall signed up.</P>
      {suggestedArtists.slice(0, 4).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <Button href={browseArtistsUrl} persona="venue">Browse matches</Button>
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
  description: "Surface local artist matches.",
  stream: "news",
  persona: "venue",
  category: "tips",
  subject: "New artists near {{venueName}}",
  previewText: "A few you might like.",
  component: VenueInactive30d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
