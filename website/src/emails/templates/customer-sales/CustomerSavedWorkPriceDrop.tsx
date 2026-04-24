// Stream: news. Price on a favourited work has dropped.

import { EmailShell, H1, P, Button, WorkCard, Badge } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWork } from "@/emails/data/mockData";

export interface CustomerSavedWorkPriceDropProps {
  firstName: string;
  workTitle: string;
  artistName: string;
  oldPrice: Money;
  newPrice: Money;
  workUrl: string;
  workImage: string;
}

export function CustomerSavedWorkPriceDrop({ firstName, workTitle, artistName, oldPrice, newPrice, workUrl, workImage }: CustomerSavedWorkPriceDropProps) {
  const work = { ...mockWork, title: workTitle, artistName, url: workUrl, image: workImage, priceLabel: formatMoney(newPrice) };
  return (
    <EmailShell stream="news" persona="customer" category="promotions" preview={`${workTitle} dropped to ${formatMoney(newPrice)}`}>
      <H1>Price change on a piece you saved</H1>
      <P>Hi {firstName} — {workTitle} by {artistName} is now <strong>{formatMoney(newPrice)}</strong> <Badge tone="success">Was {formatMoney(oldPrice)}</Badge>.</P>
      <WorkCard work={work} />
      <div style={{ marginTop: 20 }}>
        <Button href={workUrl} persona="customer">View piece</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerSavedWorkPriceDropProps = {
  firstName: "Oliver",
  workTitle: mockWork.title,
  artistName: mockWork.artistName,
  oldPrice: { amount: 30000, currency: "GBP" },
  newPrice: { amount: 24000, currency: "GBP" },
  workUrl: mockWork.url,
  workImage: mockWork.image,
};

const entry: TemplateEntry<CustomerSavedWorkPriceDropProps> = {
  id: "customer_saved_work_price_drop",
  name: "Saved work price drop",
  description: "Price drop alert for favourited works.",
  stream: "news",
  persona: "customer",
  category: "promotions",
  subject: "{{workTitle}} is now {{newPrice}}",
  previewText: "A gentle price drop.",
  component: CustomerSavedWorkPriceDrop,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
