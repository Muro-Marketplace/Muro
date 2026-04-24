// Stream: news. Upsell — managed curation service for venues.

import { EmailShell, H1, P, Button, ArtistCard, Divider, Small } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface VenueManagedCurationPitchProps {
  firstName: string;
  venueName: string;
  curationUrl: string;
  benefits: string[];
  exampleArtists: Artist[];
}

export function VenueManagedCurationPitch({ firstName, venueName, curationUrl, benefits, exampleArtists }: VenueManagedCurationPitchProps) {
  return (
    <EmailShell stream="news" persona="venue" category="promotions" preview={`Want a hand curating ${venueName}?`}>
      <H1>Curation, handled</H1>
      <P>Hi {firstName} — if you&rsquo;d rather spend time running {venueName} than picking art, our curators pick, arrange, and rotate for you.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {benefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Divider />
      <P>Recent picks we&rsquo;ve matched:</P>
      {exampleArtists.slice(0, 2).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={curationUrl} persona="venue">Talk to a curator</Button>
      </div>
      <Small>No obligation — it&rsquo;s a short call to understand your space.</Small>
    </EmailShell>
  );
}

export const mock: VenueManagedCurationPitchProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  curationUrl: "https://wallplace.co.uk/venue-portal/curation",
  benefits: [
    "A curator picks artists that suit your space and values",
    "Rotations arranged quarterly — install and collection handled",
    "Insurance and consignment records taken care of",
  ],
  exampleArtists: [mockArtist, mockArtistSecondary],
};

const entry: TemplateEntry<VenueManagedCurationPitchProps> = {
  id: "venue_managed_curation_pitch",
  name: "Managed curation pitch",
  description: "Upsell for full-service curation.",
  stream: "news",
  persona: "venue",
  category: "promotions",
  subject: "Want a hand curating {{venueName}}?",
  previewText: "We can pick, rotate, and install for you.",
  component: VenueManagedCurationPitch,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
