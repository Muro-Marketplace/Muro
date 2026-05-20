// Stream: notify (digests). Wed 9am local. Skipped if <3 events.

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
  artistMatches: number;
  placementRequests: number;
  activePlacements: number;
  suggestedArtists: Artist[];
  dashboardUrl: string;
}

export function VenueWeeklyDigest({ firstName, venueName, weekStart, weekEnd, profileViews, artistMatches, placementRequests, activePlacements, suggestedArtists, dashboardUrl }: VenueWeeklyDigestProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="digests" preview={`${venueName}'s week on Wallplace (${weekStart} - ${weekEnd})`}>
      <H1>{venueName}&rsquo;s week</H1>
      <P>Hi {firstName}, from {weekStart} to {weekEnd}.</P>
      <StatBlock stats={[
        { label: "Profile views", value: profileViews },
        { label: "Artist matches", value: artistMatches },
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
  artistMatches: 6,
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
  previewText: "Matches, requests, and active placements.",
  component: VenueWeeklyDigest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
