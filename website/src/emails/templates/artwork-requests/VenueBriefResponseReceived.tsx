// Stream: notify. An artist responded to a venue's brief. Until this existed
// the venue got a bell and nothing else, while the artist's side of the same
// exchange (accept, decline) already emails. Modelled on
// MessageUnreadNotification: a quoted preview and one link into the portal.

import { EmailShell, H1, P, Button, QuoteBlock, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueBriefResponseReceivedProps {
  firstName: string;
  artistName: string;
  requestTitle: string;
  /** "placement proposal", "purchase offer", "commission proposal" or "message". */
  responseTypeLabel: string;
  /** The artist's message, truncated by the caller to fit the block. */
  messagePreview: string;
  /** The brief's responses on the venue portal. */
  responsesUrl: string;
}

export function VenueBriefResponseReceived({
  firstName,
  artistName,
  requestTitle,
  responseTypeLabel,
  messagePreview,
  responsesUrl,
}: VenueBriefResponseReceivedProps) {
  return (
    <EmailShell
      stream="notify"
      persona="venue"
      category="placements"
      preview={`${artistName} responded to your brief`}
    >
      <H1>{artistName} responded to your brief</H1>
      <P>
        Hi {firstName}, {artistName} has responded to &ldquo;{requestTitle}&rdquo; with a{" "}
        {responseTypeLabel}.
      </P>
      <QuoteBlock attribution={artistName}>{messagePreview}</QuoteBlock>
      <Button href={responsesUrl} persona="venue">Review the response</Button>
      <Small>You can accept, decline or reply to the artist from the brief page.</Small>
    </EmailShell>
  );
}

export const mock: VenueBriefResponseReceivedProps = {
  firstName: "Hannah",
  artistName: "Maya Chen",
  requestTitle: "Coffee shop wall",
  responseTypeLabel: "placement proposal",
  messagePreview:
    "I have three warm abstracts at 90cm that would sit well against the brick. Happy to lend them on a revenue share.",
  responsesUrl: "https://wallplace.co.uk/venue-portal/artwork-requests/arq_example",
};

const entry: TemplateEntry<VenueBriefResponseReceivedProps> = {
  id: "venue_brief_response_received",
  name: "Brief response received (to venue)",
  description: "An artist responded to the venue's brief.",
  stream: "notify",
  persona: "venue",
  category: "placements",
  subject: "{{artistName}} responded to your brief",
  previewText: "Open to review their response.",
  component: VenueBriefResponseReceived,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
