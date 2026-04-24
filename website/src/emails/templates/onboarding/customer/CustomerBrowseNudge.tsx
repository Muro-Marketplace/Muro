// Stream: notify. Day-3 curated nudge.

import { EmailShell, H1, P, Button, WorkCard } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface CustomerBrowseNudgeProps {
  firstName: string;
  curatedWorks: Work[];
  browseUrl: string;
}

export function CustomerBrowseNudge({ firstName, curatedWorks, browseUrl }: CustomerBrowseNudgeProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="recommendations" preview="A handful of works you might like">
      <H1>A few pieces for you, {firstName}</H1>
      <P>Picked from artists new to the gallery this week.</P>
      {curatedWorks.slice(0, 4).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseUrl} persona="customer">See the full gallery</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerBrowseNudgeProps = {
  firstName: "Oliver",
  curatedWorks: mockWorks,
  browseUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<CustomerBrowseNudgeProps> = {
  id: "customer_browse_nudge",
  name: "Customer browse nudge",
  description: "Day-3 curated nudge for new customers.",
  stream: "notify",
  persona: "customer",
  category: "recommendations",
  subject: "A handful of works you might like, {{firstName}}",
  previewText: "New this week.",
  component: CustomerBrowseNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
