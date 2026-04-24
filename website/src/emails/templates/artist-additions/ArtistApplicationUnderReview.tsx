// ADDITION — second state. Rarely fires; only if the review takes longer.
// Stream: notify.

import { EmailShell, H1, P, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistApplicationUnderReviewProps {
  firstName: string;
  extraDays: number;
}

export function ArtistApplicationUnderReview({ firstName, extraDays }: ArtistApplicationUnderReviewProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="Your Wallplace application is still under review">
      <H1>Still with the curators</H1>
      <P>Hi {firstName} — we&rsquo;re giving your application the time it deserves. Expect to hear from us in about {extraDays} more working days.</P>
      <Small>No action needed on your end.</Small>
    </EmailShell>
  );
}

export const mock: ArtistApplicationUnderReviewProps = {
  firstName: "Maya",
  extraDays: 2,
};

const entry: TemplateEntry<ArtistApplicationUnderReviewProps> = {
  id: "artist_application_under_review",
  name: "Application under review",
  description: "Rare — fires when review exceeds the normal window.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "Your Wallplace application is still under review",
  previewText: "A little more time to deliberate.",
  component: ArtistApplicationUnderReview,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
