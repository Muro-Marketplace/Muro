// Stream: notify. Fires ~day 4 if zero works uploaded.

import { EmailShell, H1, P, Button, WorkCard, Small, TextLink } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface ArtistFirstArtworkUploadNudgeProps {
  firstName: string;
  uploadArtworkUrl: string;
  exampleWorks: Work[];
  guideUrl: string;
}

export function ArtistFirstArtworkUploadNudge({ firstName, uploadArtworkUrl, exampleWorks, guideUrl }: ArtistFirstArtworkUploadNudgeProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview="The first artwork is the hardest — here's how to add yours">
      <H1>Add your first work, {firstName}</H1>
      <P>Your portfolio&rsquo;s ready and waiting. Upload one piece to start appearing to venues.</P>
      {exampleWorks.slice(0, 2).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={uploadArtworkUrl} persona="artist">Upload artwork</Button>
      </div>
      <Small>Need a hand framing images? <TextLink href={guideUrl} persona="artist">Read our 3-minute guide</TextLink>.</Small>
    </EmailShell>
  );
}

export const mock: ArtistFirstArtworkUploadNudgeProps = {
  firstName: "Maya",
  uploadArtworkUrl: "https://wallplace.co.uk/artist-portal/portfolio",
  exampleWorks: mockWorks,
  guideUrl: "https://wallplace.co.uk/blog/upload-your-first-work",
};

const entry: TemplateEntry<ArtistFirstArtworkUploadNudgeProps> = {
  id: "artist_first_artwork_upload_nudge",
  name: "First artwork upload nudge",
  description: "Day-4 nudge for artists with zero works uploaded.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "The first artwork is the hardest — here's how to add yours",
  previewText: "Upload one piece to start appearing to venues.",
  component: ArtistFirstArtworkUploadNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
