// Stream: news. 30-day stronger CTA with portfolio stats.

import { EmailShell, H1, P, Button, StatBlock } from "@/emails/_components";
import type { Stat } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistInactive30dProps {
  firstName: string;
  portfolioStats: Stat[];
  suggestedAction: string;
  dashboardUrl: string;
}

export function ArtistInactive30d({ firstName, portfolioStats, suggestedAction, dashboardUrl }: ArtistInactive30dProps) {
  return (
    <EmailShell stream="news" persona="artist" category="tips" preview="A month in, here's your portfolio snapshot">
      <H1>A month in</H1>
      <P>Hi {firstName} — a snapshot of your portfolio this past month.</P>
      <StatBlock stats={portfolioStats} />
      <P><strong>Quick win:</strong> {suggestedAction}</P>
      <Button href={dashboardUrl} persona="artist">Open dashboard</Button>
    </EmailShell>
  );
}

export const mock: ArtistInactive30dProps = {
  firstName: "Maya",
  portfolioStats: [
    { label: "Profile views", value: 178 },
    { label: "QR scans", value: 22 },
    { label: "Placement requests", value: 1 },
  ],
  suggestedAction: "Add one new piece — artists with 5+ works appear higher in venue searches.",
  dashboardUrl: "https://wallplace.co.uk/artist-portal",
};

const entry: TemplateEntry<ArtistInactive30dProps> = {
  id: "artist_inactive_30d",
  name: "Artist inactive 30d",
  description: "Month-inactive portfolio snapshot + quick win.",
  stream: "news",
  persona: "artist",
  category: "tips",
  subject: "A month in — your portfolio snapshot",
  previewText: "A quick look, and one tiny action.",
  component: ArtistInactive30d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
