// Stream: news. 90-day venue re-engage with a human touch — feeds into
// managed curation.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueInactive90dWhiteGloveProps {
  firstName: string;
  venueName: string;
  curationRequestUrl: string;
  supportUrl?: string;
}

export function VenueInactive90dWhiteGlove({ firstName, venueName, curationRequestUrl, supportUrl }: VenueInactive90dWhiteGloveProps) {
  return (
    <EmailShell stream="news" persona="venue" category="tips" preview={`Can we help at ${venueName}?`}>
      <H1>Can we help?</H1>
      <P>Hi {firstName} — it&rsquo;s been a while since {venueName} placed art. If the barrier is time rather than interest, we&rsquo;ll do the curation for you.</P>
      <P>Reply to this email or book a short call — we&rsquo;ll handle the rest.</P>
      <Button href={curationRequestUrl} persona="venue">Request curation</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: VenueInactive90dWhiteGloveProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  curationRequestUrl: "https://wallplace.co.uk/venue-portal/curation",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<VenueInactive90dWhiteGloveProps> = {
  id: "venue_inactive_90d_white_glove",
  name: "Venue inactive 90d — white glove",
  description: "Human-touch offer to handle curation.",
  stream: "news",
  persona: "venue",
  category: "tips",
  subject: "Can we help at {{venueName}}?",
  previewText: "If time's the barrier, we've got you.",
  component: VenueInactive90dWhiteGlove,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
