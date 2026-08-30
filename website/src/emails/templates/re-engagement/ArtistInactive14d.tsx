// Stream: news. 14-day quiet return nudge.
//
// H22/H26. The cron passed `profileViews: 0` and `nearbyVenues: []` on every
// send, so a returning artist was told, in a stat block, that nobody had looked
// at their profile and that there were no venues near them. Both were literals,
// not counts. `profileViews` is now the artist's real 14-day profile_view
// count, and the "Venues near you" stat only appears when venues are actually
// supplied, which needs geo matching that does not exist yet.

import { EmailShell, H1, P, Button, StatBlock, VenueCard } from "@/emails/_components";
import type { Stat, Venue } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockVenue, mockVenueSecondary } from "@/emails/data/mockData";

export interface ArtistInactive14dProps {
  firstName: string;
  profileViews: number;
  /** Omitted when there is no venue list to show. Never rendered as zero. */
  nearbyVenues?: Venue[];
  dashboardUrl: string;
}

export function ArtistInactive14d({ firstName, profileViews, nearbyVenues = [], dashboardUrl }: ArtistInactive14dProps) {
  const stats: Stat[] = [{ label: "Profile views", value: profileViews }];
  if (nearbyVenues.length > 0) stats.push({ label: "Venues near you", value: nearbyVenues.length });
  return (
    <EmailShell stream="news" persona="artist" category="tips" preview={`${profileViews} profile views while you were away`}>
      <H1>You were missed</H1>
      <P>Hi {firstName}, quiet fortnight, but Wallplace kept moving.</P>
      <StatBlock stats={stats} />
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
  subject: "{{profileViews}} views on your profile",
  previewText: "Quiet fortnight, but things moved.",
  component: ArtistInactive14d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
