// Stream: notify (digests). Wed 9am local. Skipped if <3 events.
//
// H24: this used to carry an "Artist matches" stat, and the cron passed a
// literal 0 for it on every single send, because artist-to-venue matching does
// not exist. A permanent zero in a stat block is not a quiet week, it reads as
// a product that is not working. The stat is gone until there is a real number
// behind it; the three that remain are all counted from the database.

import { EmailShell, H1, P, Button, StatBlock, ArtistCard, Divider } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueWeeklyDigestProps {
  firstName: string;
  venueName: string;
  weekStart: string;
  weekEnd: string;
  profileViews: number;
  placementRequests: number;
  activePlacements: number;
  /** Omitted entirely when there is nothing to suggest; never rendered empty. */
  suggestedArtists?: Artist[];
  dashboardUrl: string;
}

export function VenueWeeklyDigest({ firstName, venueName, weekStart, weekEnd, profileViews, placementRequests, activePlacements, suggestedArtists = [], dashboardUrl }: VenueWeeklyDigestProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="digests" preview={`${venueName}'s week on Wallplace (${weekStart} - ${weekEnd})`}>
      <H1>{venueName}&rsquo;s week</H1>
      <P>Hi {firstName}, from {weekStart} to {weekEnd}.</P>
      <StatBlock stats={[
        { label: "Profile views", value: profileViews },
        { label: "Placement requests", value: placementRequests },
        { label: "Active placements", value: activePlacements },
      ]} />
      {suggestedArtists.length > 0 && (
        <>
          <Divider />
          <H1>New artists worth a look</H1>
          {suggestedArtists.slice(0, 3).map((a) => <ArtistCard key={a.id} artist={a} />)}
        </>
      )}
      <div style={{ marginTop: 20 }}>
        <Button href={dashboardUrl} persona="venue">Open dashboard</Button>
      </div>
    </EmailShell>
  );
}

export const mock: VenueWeeklyDigestProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  weekStart: "14 Apr",
  weekEnd: "20 Apr",
  profileViews: 218,
  placementRequests: 3,
  activePlacements: 2,
  suggestedArtists: [mockArtist, mockArtistSecondary],
  dashboardUrl: "https://wallplace.co.uk/venue-portal",
};

const entry: TemplateEntry<VenueWeeklyDigestProps> = {
  id: "venue_weekly_digest",
  name: "Weekly venue digest",
  description: "Weekly performance + new matches for venues.",
  stream: "notify",
  persona: "venue",
  category: "digests",
  subject: "{{venueName}}'s week on Wallplace",
  previewText: "Views, requests, and active placements.",
  component: VenueWeeklyDigest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
