// Stream: tx. F48. Accepting an artist's response to an artwork request was
// bell-only: no email and no thread message. Every neighbouring flow (placements,
// offers) mirrors each state change into the dm thread AND emails the other
// party, so an artist who lives in their inbox rather than the portal could miss
// a venue saying yes to their work.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistArtworkResponseAcceptedProps {
  firstName: string;
  venueName: string;
  requestTitle: string;
  /** What the acceptance produced: a placement, an offer to pay, a commission,
   *  or simply an acknowledged conversation. Drives the one-line next step. */
  outcome: "placement" | "offer" | "commission" | "message";
  nextStepUrl: string;
}

const NEXT_STEP: Record<ArtistArtworkResponseAcceptedProps["outcome"], string> = {
  placement: "Your placement is live, so the next step is agreeing when the work goes up.",
  offer: "The venue can now pay for the work. You will get a separate note the moment they do.",
  commission: "The commission is open, so you can start on the piece and keep the venue posted.",
  message: "Carry on in the thread and agree what happens next.",
};

const CTA: Record<ArtistArtworkResponseAcceptedProps["outcome"], string> = {
  placement: "Open the placement",
  offer: "View the offer",
  commission: "Open the request",
  message: "Open the conversation",
};

export function ArtistArtworkResponseAccepted({
  firstName,
  venueName,
  requestTitle,
  outcome,
  nextStepUrl,
}: ArtistArtworkResponseAcceptedProps) {
  return (
    <EmailShell stream="tx" persona="artist" category="placements" preview={`${venueName} accepted your response`}>
      <H1>{venueName} said yes</H1>
      <P>Hi {firstName}, {venueName} has accepted your response to &ldquo;{requestTitle}&rdquo;.</P>
      <P>{NEXT_STEP[outcome]}</P>
      <Button href={nextStepUrl} persona="artist">{CTA[outcome]}</Button>
      <Small>You are getting this because you responded to this venue&rsquo;s brief on Wallplace.</Small>
    </EmailShell>
  );
}

export const mock: ArtistArtworkResponseAcceptedProps = {
  firstName: "Maya",
  venueName: "The Copper Kettle",
  requestTitle: "Coffee shop wall",
  outcome: "placement",
  nextStepUrl: "https://wallplace.co.uk/artist-portal/placements",
};

const entry: TemplateEntry<ArtistArtworkResponseAcceptedProps> = {
  id: "artist_artwork_response_accepted",
  name: "Artwork request response accepted (to artist)",
  description: "The venue accepted the artist's response to their brief, with the next step.",
  stream: "tx",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} accepted your response",
  previewText: "Your response to the brief was accepted, here is what happens next.",
  component: ArtistArtworkResponseAccepted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
