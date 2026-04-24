// Stream: notify. Fires on new review — shows stars + text.

import { EmailShell, H1, P, Button, QuoteBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ReviewPostedNotificationProps {
  firstName: string;
  reviewerName: string;
  reviewRating: number;
  reviewText?: string;
  reviewUrl: string;
}

export function ReviewPostedNotification({ firstName, reviewerName, reviewRating, reviewText, reviewUrl }: ReviewPostedNotificationProps) {
  const stars = "★".repeat(reviewRating) + "☆".repeat(5 - reviewRating);
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`${reviewerName} left you a ${reviewRating}-star review`}>
      <H1>New review from {reviewerName}</H1>
      <P>Hi {firstName} — {reviewerName} gave you <span style={{ color: "#C17C5A", letterSpacing: "0.05em" }}>{stars}</span></P>
      {reviewText && <QuoteBlock attribution={reviewerName}>{reviewText}</QuoteBlock>}
      <Button href={reviewUrl}>View review</Button>
    </EmailShell>
  );
}

export const mock: ReviewPostedNotificationProps = {
  firstName: "Maya",
  reviewerName: "The Curzon",
  reviewRating: 5,
  reviewText: "Thoughtful, prompt, easy to work with. The Mare Street series has been a hit with guests.",
  reviewUrl: "https://wallplace.co.uk/artist-portal/reviews",
};

const entry: TemplateEntry<ReviewPostedNotificationProps> = {
  id: "review_posted_notification",
  name: "Review posted notification",
  description: "New review received.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "{{reviewerName}} left you a {{reviewRating}}-star review",
  previewText: "Read the review.",
  component: ReviewPostedNotification,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
