// Stream: news. 30-day customer re-engage with recommended works.

import { EmailShell, H1, P, Button, WorkCard } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface CustomerInactive30dProps {
  firstName: string;
  recommendedWorks: Work[];
  browseUrl: string;
}

export function CustomerInactive30d({ firstName, recommendedWorks, browseUrl }: CustomerInactive30dProps) {
  return (
    <EmailShell stream="news" persona="customer" category="tips" preview="New pieces worth seeing">
      <H1>New since you were last here</H1>
      <P>Hi {firstName} — a small curation from the last few weeks.</P>
      {recommendedWorks.slice(0, 4).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseUrl} persona="customer">Browse the gallery</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerInactive30dProps = {
  firstName: "Oliver",
  recommendedWorks: mockWorks,
  browseUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<CustomerInactive30dProps> = {
  id: "customer_inactive_30d",
  name: "Customer inactive 30d",
  description: "Re-engage with fresh works.",
  stream: "news",
  persona: "customer",
  category: "tips",
  subject: "New pieces worth seeing",
  previewText: "Since you were last here.",
  component: CustomerInactive30d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
