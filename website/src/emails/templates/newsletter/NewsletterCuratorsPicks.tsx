// Stream: news.

import { EmailShell, H1, P, WorkCard, Button, Divider } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface NewsletterCuratorsPicksProps {
  firstName: string;
  theme: string;
  intro: string;
  works: Work[];
  browseUrl: string;
}

export function NewsletterCuratorsPicks({ firstName, theme, intro, works, browseUrl }: NewsletterCuratorsPicksProps) {
  return (
    <EmailShell stream="news" persona="customer" category="newsletter" preview={`Curator's picks: ${theme}`}>
      <H1>Curator&rsquo;s picks — {theme}</H1>
      <P>Dear {firstName},</P>
      <P>{intro}</P>
      <Divider />
      {works.slice(0, 5).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 24 }}>
        <Button href={browseUrl} persona="customer">See the full collection</Button>
      </div>
    </EmailShell>
  );
}

export const mock: NewsletterCuratorsPicksProps = {
  firstName: "Oliver",
  theme: "Pieces for a quiet wall",
  intro: "A small selection for spaces that already have enough going on — photographs and paintings that reward a long, unhurried look.",
  works: mockWorks,
  browseUrl: "https://wallplace.co.uk/collections/quiet",
};

const entry: TemplateEntry<NewsletterCuratorsPicksProps> = {
  id: "newsletter_curators_picks",
  name: "Curator's picks",
  description: "Themed curator selection.",
  stream: "news",
  persona: "customer",
  category: "newsletter",
  subject: "Curator's picks: {{theme}}",
  previewText: "A small, themed selection.",
  component: NewsletterCuratorsPicks,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
