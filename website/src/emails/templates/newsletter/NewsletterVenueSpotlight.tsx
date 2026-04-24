// Stream: news.

import { EmailShell, H1, P, Hero, PlacementCard, Button } from "@/emails/_components";
import type { Placement, Venue } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockPlacement, mockVenue } from "@/emails/data/mockData";

export interface NewsletterVenueSpotlightProps {
  firstName: string;
  venue: Venue;
  currentPlacements: Placement[];
  venueStory: string;
  venueUrl: string;
}

export function NewsletterVenueSpotlight({ firstName, venue, currentPlacements, venueStory, venueUrl }: NewsletterVenueSpotlightProps) {
  return (
    <EmailShell stream="news" persona="multi" category="newsletter" preview={`Venue spotlight: ${venue.name}`}>
      <Hero image={venue.image} alt={venue.name} />
      <div style={{ paddingTop: 16 }}>
        <H1>{venue.name}</H1>
        <P>Dear {firstName},</P>
        <P>{venueStory}</P>
      </div>
      {currentPlacements.slice(0, 2).map((p) => <PlacementCard key={p.id} placement={p} />)}
      <div style={{ marginTop: 24 }}>
        <Button href={venueUrl}>Visit {venue.name}</Button>
      </div>
    </EmailShell>
  );
}

export const mock: NewsletterVenueSpotlightProps = {
  firstName: "Oliver",
  venue: mockVenue,
  currentPlacements: [mockPlacement],
  venueStory: "The Curzon's lobby has been rotating art since long before 'rotating art' was a feature. We caught up with their programming lead on what makes a cinema wall different — and why the pieces that thrive there don't compete with the film.",
  venueUrl: mockVenue.url,
};

const entry: TemplateEntry<NewsletterVenueSpotlightProps> = {
  id: "newsletter_venue_spotlight",
  name: "Venue spotlight",
  description: "Featured venue editorial.",
  stream: "news",
  persona: "multi",
  category: "newsletter",
  subject: "Venue spotlight: {{venueName}}",
  previewText: "A closer look at the space.",
  component: NewsletterVenueSpotlight,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
