// Stream: notify. +14d review request.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerPurchaseReviewRequestProps {
  firstName: string;
  workTitle: string;
  artistName: string;
  reviewUrl: string;
}

export function CustomerPurchaseReviewRequest({ firstName, workTitle, artistName, reviewUrl }: CustomerPurchaseReviewRequestProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="recommendations" preview={`A few words on ${workTitle}?`}>
      <H1>A few words on {workTitle}?</H1>
      <P>Hi {firstName} — has {workTitle} settled in? A short review helps {artistName} reach the next collector.</P>
      <Button href={reviewUrl} persona="customer">Leave a review</Button>
    </EmailShell>
  );
}

export const mock: CustomerPurchaseReviewRequestProps = {
  firstName: "Oliver",
  workTitle: "Last Light on Mare Street",
  artistName: "Maya Chen",
  reviewUrl: "https://wallplace.co.uk/orders/WP-28473/review",
};

const entry: TemplateEntry<CustomerPurchaseReviewRequestProps> = {
  id: "customer_purchase_review_request",
  name: "Review request after purchase",
  description: "+14d post-delivery review prompt.",
  stream: "notify",
  persona: "customer",
  category: "recommendations",
  subject: "A few words on {{workTitle}}?",
  previewText: "Your review helps the artist.",
  component: CustomerPurchaseReviewRequest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
