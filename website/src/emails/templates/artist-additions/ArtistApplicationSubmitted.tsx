// ADDITION — first state in the application lifecycle. Stream: notify.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistApplicationSubmittedProps {
  firstName: string;
  reviewTimelineDays: number;
  portfolioUrl: string;
}

export function ArtistApplicationSubmitted({ firstName, reviewTimelineDays, portfolioUrl }: ArtistApplicationSubmittedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="We've received your Wallplace application">
      <H1>Application received</H1>
      <P>Thanks for applying, {firstName} — we&rsquo;ll review your work and get back to you within {reviewTimelineDays} working days.</P>
      <P>While you wait, polish your profile so you&rsquo;re ready to go live the moment you&rsquo;re accepted.</P>
      <Button href={portfolioUrl} persona="artist">Open portfolio</Button>
      <Small>We review by hand and read every submission.</Small>
    </EmailShell>
  );
}

export const mock: ArtistApplicationSubmittedProps = {
  firstName: "Maya",
  reviewTimelineDays: 3,
  portfolioUrl: "https://wallplace.co.uk/artist-portal/portfolio",
};

const entry: TemplateEntry<ArtistApplicationSubmittedProps> = {
  id: "artist_application_submitted",
  name: "Application submitted",
  description: "Receipt confirming the application is in.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "We've received your Wallplace application",
  previewText: "We'll be in touch within a few days.",
  component: ArtistApplicationSubmitted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
