// Stream: notify (digests). Tuesday 9am local. Skipped if <3 notable events.

import { EmailShell, H1, P, Button, StatBlock, WorkCard, Divider, Small } from "@/emails/_components";
import type { Stat, Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockStats, mockWorks } from "@/emails/data/mockData";

export interface ArtistWeeklyPortfolioDigestProps {
  firstName: string;
  weekStart: string;
  weekEnd: string;
  profileViews: number;
  qrScans: number;
  messages: number;
  placementRequests: number;
  topWorks: Work[];
  recommendedActions: string[];
  dashboardUrl: string;
}

export function ArtistWeeklyPortfolioDigest({ firstName, weekStart, weekEnd, profileViews, qrScans, messages, placementRequests, topWorks, recommendedActions, dashboardUrl }: ArtistWeeklyPortfolioDigestProps) {
  const stats: Stat[] = [
    { label: "Profile views", value: profileViews },
    { label: "QR scans", value: qrScans },
    { label: "Messages", value: messages },
    { label: "Placement requests", value: placementRequests },
  ];
  return (
    <EmailShell stream="notify" persona="artist" category="digests" preview={`Your week on Wallplace (${weekStart} - ${weekEnd})`}>
      <H1>Your week on Wallplace</H1>
      <P>Hi {firstName}, here&rsquo;s how your work performed from {weekStart} to {weekEnd}.</P>
      <StatBlock stats={stats} />
      <Divider />
      <H1>Top works this week</H1>
      {topWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      {recommendedActions.length > 0 && (
        <>
          <Divider />
          <H1>Suggestions for this week</H1>
          <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
            {recommendedActions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </>
      )}
      <Button href={dashboardUrl} persona="artist">Open dashboard</Button>
      <Small>Weekly. Always skippable.</Small>
    </EmailShell>
  );
}

export const mock: ArtistWeeklyPortfolioDigestProps = {
  firstName: "Maya",
  weekStart: "14 Apr",
  weekEnd: "20 Apr",
  profileViews: mockStats[0].value as number,
  qrScans: mockStats[1].value as number,
  messages: mockStats[2].value as number,
  placementRequests: mockStats[3].value as number,
  topWorks: mockWorks,
  recommendedActions: [
    "Reply to 2 unread messages from venues",
    "Update the caption on your top-performing work",
    "Add one new piece, artists with 5+ works appear to venues first",
  ],
  dashboardUrl: "https://wallplace.co.uk/artist-portal",
};

const entry: TemplateEntry<ArtistWeeklyPortfolioDigestProps> = {
  id: "artist_weekly_portfolio_digest",
  name: "Weekly artist portfolio digest",
  description: "Weekly performance email for active artists.",
  stream: "notify",
  persona: "artist",
  category: "digests",
  subject: "Your week on Wallplace, {{firstName}}",
  previewText: "Views, scans, and a few prompts.",
  component: ArtistWeeklyPortfolioDigest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
