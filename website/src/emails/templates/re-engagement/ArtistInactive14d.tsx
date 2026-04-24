// Stream: news. 14-day quiet return nudge.

import { EmailShell, H1, P, Button, StatBlock, VenueCard } from "@/emails/_components";
import type { Venue } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockVenue, mockVenueSecondary } from "@/emails/data/mockData";

export interface ArtistInactive14dProps {
  firstName: string;
  profileViews: number;
  nearbyVenues: Venue[];
  dashboardUrl: string;
}

export function ArtistInactive14d({ firstName, profileViews, nearbyVenues, dashboardUrl }: ArtistInactive14dProps) {
  return (
    <EmailShell stream="news" persona="artist" category="tips" preview={`${profileViews} venues viewed your profile while you were away`}>
      <H1>You were missed</H1>
      <P>Hi {firstName} — quiet fortnight, but Wallplace kept moving.</P>
      <StatBlock stats={[{ label: "Profile views", value: profileViews }, { label: "Venues near you", value: nearbyVenues.length }]} />
      {nearbyVenues.slice(0, 2).map((v) => <VenueCard key={v.id} venue={v} />)}
      <Button href={dashboardUrl} persona="artist">Pick up where you left off</Button>
    </EmailShell>
  );
}

export const mock: ArtistInactive14dProps = {
  firstName: "Maya",
  profileViews: 43,
  nearbyVenues: [mockVenue, mockVenueSecondary],
  dashboardUrl: "https://wallplace.co.uk/artist-portal",
};

const entry: TemplateEntry<ArtistInactive14dProps> = {
  id: "artist_inactive_14d",
  name: "Artist inactive 14d",
  description: "Light re-engagement after two quiet weeks.",
  stream: "news",
  persona: "artist",
  category: "tips",
  subject: "{{profileViews}} venues viewed your profile",
  previewText: "Quiet fortnight, but things moved.",
  component: ArtistInactive14d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
