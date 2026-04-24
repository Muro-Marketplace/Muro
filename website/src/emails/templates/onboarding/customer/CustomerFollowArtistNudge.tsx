// Stream: notify. Day-7 nudge encouraging follows.

import { EmailShell, H1, P, Button, ArtistCard } from "@/emails/_components";
import type { Artist } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

export interface CustomerFollowArtistNudgeProps {
  firstName: string;
  suggestedArtists: Artist[];
  discoverArtistsUrl: string;
}

export function CustomerFollowArtistNudge({ firstName, suggestedArtists, discoverArtistsUrl }: CustomerFollowArtistNudgeProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="recommendations" preview="Follow an artist to see their new work first">
      <H1>Artists you might like, {firstName}</H1>
      <P>Follow an artist and you&rsquo;ll see their new works as soon as they publish — no browsing required.</P>
      {suggestedArtists.slice(0, 3).map((a) => <ArtistCard key={a.id} artist={a} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={discoverArtistsUrl} persona="customer">Discover more artists</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerFollowArtistNudgeProps = {
  firstName: "Oliver",
  suggestedArtists: [mockArtist, mockArtistSecondary],
  discoverArtistsUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<CustomerFollowArtistNudgeProps> = {
  id: "customer_follow_artist_nudge",
  name: "Customer follow artist nudge",
  description: "Day-7 encouragement to follow an artist.",
  stream: "notify",
  persona: "customer",
  category: "recommendations",
  subject: "Artists you might like, {{firstName}}",
  previewText: "Follow to see new works first.",
  component: CustomerFollowArtistNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
