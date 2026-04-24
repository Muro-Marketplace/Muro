// Stream: news (tips). Educational rather than operational — keep it rare.

import { EmailShell, H1, P, Button, WorkCard, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWork } from "@/emails/data/mockData";

export interface ArtistLowEngagementTipsProps {
  firstName: string;
  workTitle: string;
  workUrl: string;
  workImage: string;
  tips: string[];
  editWorkUrl: string;
}

export function ArtistLowEngagementTips({ firstName, workTitle, workUrl, workImage, tips, editWorkUrl }: ArtistLowEngagementTipsProps) {
  const work = { ...mockWork, title: workTitle, url: workUrl, image: workImage };
  return (
    <EmailShell stream="news" persona="artist" category="tips" preview={`A couple of tweaks could lift ${workTitle}`}>
      <H1>A couple of tweaks could lift this piece</H1>
      <P>Hi {firstName} — <strong>{workTitle}</strong> isn&rsquo;t getting much attention yet. These are the things that tend to help most.</P>
      <WorkCard work={work} />
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <Button href={editWorkUrl} persona="artist">Edit this work</Button>
      <Small>We only send tips when we think there&rsquo;s an easy win.</Small>
    </EmailShell>
  );
}

export const mock: ArtistLowEngagementTipsProps = {
  firstName: "Maya",
  workTitle: mockWork.title,
  workUrl: mockWork.url,
  workImage: mockWork.image,
  tips: [
    "Add a 2-sentence caption — context helps venues picture it on the wall",
    "Shoot the image on a neutral background — less crop, less glare",
    "Set a single headline price rather than five options",
  ],
  editWorkUrl: "https://wallplace.co.uk/artist-portal/portfolio",
};

const entry: TemplateEntry<ArtistLowEngagementTipsProps> = {
  id: "artist_low_engagement_tips",
  name: "Low-engagement tips",
  description: "Educational nudge on a specific piece.",
  stream: "news",
  persona: "artist",
  category: "tips",
  subject: "A couple of tweaks could lift {{workTitle}}",
  previewText: "Small changes, outsized effect.",
  component: ArtistLowEngagementTips,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
