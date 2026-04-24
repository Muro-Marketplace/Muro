// Stream: news (newsletter). Double-opt-in only.

import { EmailShell, H1, P, Hero, WorkCard, ArtistCard, VenueCard, Divider, Button } from "@/emails/_components";
import type { Artist, Venue, Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary, mockVenue, mockVenueSecondary, mockWorks } from "@/emails/data/mockData";

export interface NewsletterMonthlyGalleryProps {
  firstName: string;
  heroImage: string;
  heroAlt: string;
  editorialIntro: string;
  featuredWorks: Work[];
  featuredArtists: Artist[];
  featuredVenues: Venue[];
  browseUrl: string;
}

export function NewsletterMonthlyGallery({ firstName, heroImage, heroAlt, editorialIntro, featuredWorks, featuredArtists, featuredVenues, browseUrl }: NewsletterMonthlyGalleryProps) {
  return (
    <EmailShell stream="news" persona="customer" category="newsletter" preview="Wallplace, this month">
      <Hero image={heroImage} alt={heroAlt} />
      <div style={{ paddingTop: 16 }}>
        <H1>Wallplace, this month</H1>
        <P>Dear {firstName},</P>
        <P>{editorialIntro}</P>
      </div>
      <Divider />
      <H1>Pieces we loved</H1>
      {featuredWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <Divider />
      <H1>Artists in focus</H1>
      {featuredArtists.slice(0, 2).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <Divider />
      <H1>Venues worth a visit</H1>
      {featuredVenues.slice(0, 2).map((v) => <VenueCard key={v.id} venue={v} />)}
      <div style={{ marginTop: 24 }}>
        <Button href={browseUrl} persona="customer">Browse the gallery</Button>
      </div>
    </EmailShell>
  );
}

export const mock: NewsletterMonthlyGalleryProps = {
  firstName: "Oliver",
  heroImage: mockWorks[0].image,
  heroAlt: "Gallery hero",
  editorialIntro: "April has been a quiet, attentive month — photographs of late light, paintings reaching towards stillness. Here's what caught our eye.",
  featuredWorks: mockWorks,
  featuredArtists: [mockArtist, mockArtistSecondary],
  featuredVenues: [mockVenue, mockVenueSecondary],
  browseUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<NewsletterMonthlyGalleryProps> = {
  id: "newsletter_monthly_gallery",
  name: "Monthly gallery newsletter",
  description: "Editorial monthly newsletter.",
  stream: "news",
  persona: "customer",
  category: "newsletter",
  subject: "Wallplace, this month",
  previewText: "An editorial round-up.",
  component: NewsletterMonthlyGallery,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
