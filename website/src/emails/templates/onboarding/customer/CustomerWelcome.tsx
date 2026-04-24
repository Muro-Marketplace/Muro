// Stream: notify. Day-0 customer welcome with curated works.

import { EmailShell, H1, P, Button, SecondaryButton, WorkCard } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface CustomerWelcomeProps {
  firstName: string;
  browseUrl: string;
  featuredWorks: Work[];
  followArtistsUrl: string;
}

export function CustomerWelcome({ firstName, browseUrl, featuredWorks, followArtistsUrl }: CustomerWelcomeProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="recommendations" preview="Welcome to Wallplace — a few works to start with">
      <H1>Welcome, {firstName}</H1>
      <P>Wallplace is a curated marketplace of independent artists showing work in real venues. Here are a few pieces to start with.</P>
      {featuredWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseUrl} persona="customer">Browse the gallery</Button>{" "}
        <SecondaryButton href={followArtistsUrl} persona="customer">Follow an artist</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerWelcomeProps = {
  firstName: "Oliver",
  browseUrl: "https://wallplace.co.uk/browse",
  featuredWorks: mockWorks,
  followArtistsUrl: "https://wallplace.co.uk/browse?sort=new",
};

const entry: TemplateEntry<CustomerWelcomeProps> = {
  id: "customer_welcome",
  name: "Customer welcome",
  description: "Day-0 customer welcome.",
  stream: "notify",
  persona: "customer",
  category: "recommendations",
  subject: "Welcome to Wallplace, {{firstName}}",
  previewText: "A few works to start with.",
  component: CustomerWelcome,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
