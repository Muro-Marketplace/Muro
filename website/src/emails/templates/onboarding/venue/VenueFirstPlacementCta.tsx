// Stream: notify. Day-10 CTA to request the venue's first placement.

import { EmailShell, H1, P, Button, ArtistCard } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueFirstPlacementCtaProps {
  firstName: string;
  venueName: string;
  browseArtistsUrl: string;
  suggestedArtists: Artist[];
}

export function VenueFirstPlacementCta({ firstName, venueName, browseArtistsUrl, suggestedArtists }: VenueFirstPlacementCtaProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview={`Ready to host art at ${venueName}?`}>
      <H1>Ready for your first placement?</H1>
      <P>Hi {firstName} — {venueName} is set up. Here are a few artists who&rsquo;d fit your space.</P>
      {suggestedArtists.slice(0, 3).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseArtistsUrl} persona="venue">Browse all artists</Button>
      </div>
    </EmailShell>
  );
}

export const mock: VenueFirstPlacementCtaProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  browseArtistsUrl: "https://wallplace.co.uk/browse",
  suggestedArtists: [mockArtist, mockArtistSecondary],
};

const entry: TemplateEntry<VenueFirstPlacementCtaProps> = {
  id: "venue_first_placement_cta",
  name: "Venue first placement CTA",
  description: "Day-10 CTA to request the venue's first placement.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Ready to host art at {{venueName}}?",
  previewText: "A few artists who'd fit your space.",
  component: VenueFirstPlacementCta,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
