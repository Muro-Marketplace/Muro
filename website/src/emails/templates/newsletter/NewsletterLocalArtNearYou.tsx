// Stream: news. Geo-targeted editorial — works and artists near the reader.

import { EmailShell, H1, P, WorkCard, ArtistCard, Button, Divider } from "@/emails/_components";
import type { Artist, Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary, mockWorks } from "@/emails/data/mockData";

export interface NewsletterLocalArtNearYouProps {
  firstName: string;
  location: string;
  localWorks: Work[];
  localArtists: Artist[];
  browseUrl: string;
}

export function NewsletterLocalArtNearYou({ firstName, location, localWorks, localArtists, browseUrl }: NewsletterLocalArtNearYouProps) {
  return (
    <EmailShell stream="news" persona="customer" category="newsletter" preview={`Art from around ${location}`}>
      <H1>Art from around {location}</H1>
      <P>Hi {firstName} — a small selection of work showing near you right now.</P>
      <Divider />
      <H1>Works up the road</H1>
      {localWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <Divider />
      <H1>Local artists worth following</H1>
      {localArtists.slice(0, 2).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <div style={{ marginTop: 24 }}>
        <Button href={browseUrl} persona="customer">Browse local</Button>
      </div>
    </EmailShell>
  );
}

export const mock: NewsletterLocalArtNearYouProps = {
  firstName: "Oliver",
  location: "East London",
  localWorks: mockWorks,
  localArtists: [mockArtist, mockArtistSecondary],
  browseUrl: "https://wallplace.co.uk/browse?location=east-london",
};

const entry: TemplateEntry<NewsletterLocalArtNearYouProps> = {
  id: "newsletter_local_art_near_you",
  name: "Local art near you",
  description: "Geo-targeted editorial.",
  stream: "news",
  persona: "customer",
  category: "newsletter",
  subject: "Art from around {{location}}",
  previewText: "A local round-up.",
  component: NewsletterLocalArtNearYou,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
