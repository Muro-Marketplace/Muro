// ADDITION — annual retrospective. Massive engagement moment. Stream: news
// (editorial-ish). Suppressible but rarely turned off.

import { EmailShell, H1, P, Button, StatBlock, WorkCard, QuoteBlock, Divider } from "@/emails/_components";
import type { Stat, Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface ArtistYearInReviewProps {
  firstName: string;
  year: number;
  stats: Stat[];
  topWorks: Work[];
  favouriteMoment?: string;
  dashboardUrl: string;
}

export function ArtistYearInReview({ firstName, year, stats, topWorks, favouriteMoment, dashboardUrl }: ArtistYearInReviewProps) {
  return (
    <EmailShell stream="news" persona="artist" category="newsletter" preview={`Your ${year} on Wallplace`}>
      <H1>Your {year} on Wallplace</H1>
      <P>Hi {firstName} — a small scrapbook of how your work travelled this year.</P>
      <StatBlock stats={stats} />
      <Divider />
      <H1>Most-seen works</H1>
      {topWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      {favouriteMoment && (
        <>
          <Divider />
          <QuoteBlock attribution="A venue">{favouriteMoment}</QuoteBlock>
        </>
      )}
      <Button href={dashboardUrl} persona="artist">See full summary</Button>
    </EmailShell>
  );
}

export const mock: ArtistYearInReviewProps = {
  firstName: "Maya",
  year: 2026,
  stats: [
    { label: "Placements", value: 6 },
    { label: "QR scans", value: 1824 },
    { label: "Sales", value: 14 },
    { label: "Payouts", value: "£4,210" },
  ],
  topWorks: mockWorks,
  favouriteMoment: "The Mare Street series drew more comments than any piece we've hosted this year.",
  dashboardUrl: "https://wallplace.co.uk/artist-portal/year-in-review",
};

const entry: TemplateEntry<ArtistYearInReviewProps> = {
  id: "artist_year_in_review",
  name: "Artist year-in-review",
  description: "Annual retrospective for artists.",
  stream: "news",
  persona: "artist",
  category: "newsletter",
  subject: "Your {{year}} on Wallplace, {{firstName}}",
  previewText: "A small scrapbook.",
  component: ArtistYearInReview,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
