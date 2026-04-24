// Stream: news.

import { EmailShell, H1, P, Hero, WorkCard, Button, QuoteBlock } from "@/emails/_components";
import type { Artist, Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockWorks } from "@/emails/data/mockData";

export interface NewsletterArtistSpotlightProps {
  firstName: string;
  artist: Artist;
  works: Work[];
  artistStory: string;
  artistUrl: string;
}

export function NewsletterArtistSpotlight({ firstName, artist, works, artistStory, artistUrl }: NewsletterArtistSpotlightProps) {
  return (
    <EmailShell stream="news" persona="multi" category="newsletter" preview={`Artist spotlight: ${artist.name}`}>
      <Hero image={works[0]?.image || artist.avatar} alt={artist.name} />
      <div style={{ paddingTop: 16 }}>
        <H1>{artist.name}</H1>
        <P>Dear {firstName},</P>
        <P>{artistStory}</P>
      </div>
      <QuoteBlock attribution={artist.name}>{"Light, mostly. That's what I keep coming back to."}</QuoteBlock>
      {works.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 24 }}>
        <Button href={artistUrl}>Visit {artist.name}</Button>
      </div>
    </EmailShell>
  );
}

export const mock: NewsletterArtistSpotlightProps = {
  firstName: "Oliver",
  artist: mockArtist,
  works: mockWorks,
  artistStory: "Maya Chen's work lives on the eastern edges of London — late-light photography that treats the overlooked as subject matter worth staying with. Her Mare Street series, begun in 2023, has quietly become one of our most-placed portfolios.",
  artistUrl: mockArtist.url,
};

const entry: TemplateEntry<NewsletterArtistSpotlightProps> = {
  id: "newsletter_artist_spotlight",
  name: "Artist spotlight",
  description: "Featured artist editorial.",
  stream: "news",
  persona: "multi",
  category: "newsletter",
  subject: "Artist spotlight: {{artistName}}",
  previewText: "A closer look.",
  component: NewsletterArtistSpotlight,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
