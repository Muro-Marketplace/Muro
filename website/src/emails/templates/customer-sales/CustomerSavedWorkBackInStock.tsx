// Stream: news. Saved work is available again.

import { EmailShell, H1, P, Button, WorkCard } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWork } from "@/emails/data/mockData";

export interface CustomerSavedWorkBackInStockProps {
  firstName: string;
  workTitle: string;
  artistName: string;
  workUrl: string;
  workImage: string;
}

export function CustomerSavedWorkBackInStock({ firstName, workTitle, artistName, workUrl, workImage }: CustomerSavedWorkBackInStockProps) {
  const work = { ...mockWork, title: workTitle, artistName, url: workUrl, image: workImage };
  return (
    <EmailShell stream="news" persona="customer" category="promotions" preview={`${workTitle} is available again`}>
      <H1>Available again</H1>
      <P>Hi {firstName} — {workTitle} by {artistName} is back. These tend not to stick around.</P>
      <WorkCard work={work} />
      <div style={{ marginTop: 20 }}>
        <Button href={workUrl} persona="customer">View piece</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerSavedWorkBackInStockProps = {
  firstName: "Oliver",
  workTitle: mockWork.title,
  artistName: mockWork.artistName,
  workUrl: mockWork.url,
  workImage: mockWork.image,
};

const entry: TemplateEntry<CustomerSavedWorkBackInStockProps> = {
  id: "customer_saved_work_back_in_stock",
  name: "Saved work back in stock",
  description: "Re-availability alert for favourited works.",
  stream: "news",
  persona: "customer",
  category: "promotions",
  subject: "{{workTitle}} is available again",
  previewText: "Back in the gallery.",
  component: CustomerSavedWorkBackInStock,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
