// ADDITION — warm but honest rejection. Stream: notify.
// Note: keep the tone graceful. This is often someone's first impression
// of the brand.

import { EmailShell, H1, P, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistApplicationRejectedProps {
  firstName: string;
  feedback?: string;
  reapplyInMonths?: number;
  supportUrl?: string;
}

export function ArtistApplicationRejected({ firstName, feedback, reapplyInMonths, supportUrl }: ArtistApplicationRejectedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="A note on your Wallplace application">
      <H1>A note on your application</H1>
      <P>Hi {firstName} — thank you for showing us your work. This time around, we&rsquo;re not able to offer you a place on Wallplace.</P>
      {feedback && <P>{feedback}</P>}
      {reapplyInMonths && <P>You&rsquo;re very welcome to apply again in {reapplyInMonths} months with new work.</P>}
      <Small>We know this one stings. It&rsquo;s not a comment on the value of your practice — just a fit for the current roster.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistApplicationRejectedProps = {
  firstName: "Maya",
  feedback: "Your practice is clearly considered — we'd love to see more exterior work and a tighter edit of your strongest pieces in a future submission.",
  reapplyInMonths: 6,
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistApplicationRejectedProps> = {
  id: "artist_application_rejected",
  name: "Application rejected",
  description: "Graceful decline with optional feedback and reapply window.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "A note on your Wallplace application",
  previewText: "Thank you for sharing your work.",
  component: ArtistApplicationRejected,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
