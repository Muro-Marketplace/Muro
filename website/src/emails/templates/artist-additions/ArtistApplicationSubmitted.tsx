// ADDITION, first state in the application lifecycle. Stream: notify.
//
// A52. The receipt promised a reply "within 3 working days" because
// api/apply passed `reviewTimelineDays: 3`, while every public page, the home
// page, /apply, /how-it-works, /faqs, /pricing, /artists, promises 5 business
// days. An applicant read one number on the site and a shorter one in their
// inbox, and the shorter one is the one we would miss.
//
// The timeline is a published promise, not a per-send variable, so it lives
// here as a constant. `reviewTimelineDays` is kept on the props only so the
// existing caller keeps compiling; it is deliberately not read.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

/** The turnaround every public page commits to. Change both, or neither. */
export const REVIEW_TIMELINE_BUSINESS_DAYS = 5;

export interface ArtistApplicationSubmittedProps {
  firstName: string;
  /**
   * @deprecated Ignored. The timeline is REVIEW_TIMELINE_BUSINESS_DAYS, which
   * has to match the public pages. Drop this from the api/apply call site.
   */
  reviewTimelineDays?: number;
  portfolioUrl: string;
}

export function ArtistApplicationSubmitted({ firstName, portfolioUrl }: ArtistApplicationSubmittedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="We've received your Wallplace application">
      <H1>Application received</H1>
      <P>Thanks for applying, {firstName}, we&rsquo;ll review your work and get back to you within {REVIEW_TIMELINE_BUSINESS_DAYS} business days.</P>
      <P>While you wait, polish your profile so you&rsquo;re ready to go live the moment you&rsquo;re accepted.</P>
      <Button href={portfolioUrl} persona="artist">Open portfolio</Button>
      <Small>We review by hand and read every submission.</Small>
    </EmailShell>
  );
}

export const mock: ArtistApplicationSubmittedProps = {
  firstName: "Maya",
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
  previewText: "We'll be in touch within 5 business days.",
  component: ArtistApplicationSubmitted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
