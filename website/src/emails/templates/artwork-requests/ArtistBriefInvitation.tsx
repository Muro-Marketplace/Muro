// Stream: notify. A venue posted a brief and named this artist on its invite
// list. Modelled on ArtistNewPlacementInvitation, which is the same shape of
// event (a venue asking for this artist's work) one step earlier.
//
// Sent ONLY to the artists on artwork_requests.invited_artist_slugs. A
// semi-public brief with no invite list is discoverable from the artist
// portal and emails nobody; this is not a broadcast.

import { EmailShell, H1, P, Button, InfoBox, QuoteBlock, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistBriefInvitationProps {
  firstName: string;
  venueName: string;
  requestTitle: string;
  /** The brief's description, truncated by the caller to fit the block. */
  briefExcerpt: string;
  /** The brief on the artist portal. */
  requestUrl: string;
  /** "Purchase, commission", from the brief's intent list. */
  intentLabel?: string;
  /** "£200 to £600", from the budget columns. */
  budgetLabel?: string;
  /** "Within a few weeks", from the timescale column. */
  timescaleLabel?: string;
}

export function ArtistBriefInvitation({
  firstName,
  venueName,
  requestTitle,
  briefExcerpt,
  requestUrl,
  intentLabel,
  budgetLabel,
  timescaleLabel,
}: ArtistBriefInvitationProps) {
  return (
    <EmailShell
      stream="notify"
      persona="artist"
      category="placements"
      preview={`${venueName} has invited you to respond to a brief`}
    >
      <H1>{venueName} would like to hear from you</H1>
      <P>
        Hi {firstName}, <strong>{venueName}</strong> has posted a brief on Wallplace and named you
        as one of the artists they would like a response from.
      </P>
      <InfoBox tone="neutral">
        <strong>Brief:</strong> {requestTitle}
        {intentLabel && (
          <>
            <br />
            <strong>Looking for:</strong> {intentLabel}
          </>
        )}
        {budgetLabel && (
          <>
            <br />
            <strong>Budget:</strong> {budgetLabel}
          </>
        )}
        {timescaleLabel && (
          <>
            <br />
            <strong>Timescale:</strong> {timescaleLabel}
          </>
        )}
      </InfoBox>
      {briefExcerpt && <QuoteBlock attribution={venueName}>{briefExcerpt}</QuoteBlock>}
      <div style={{ marginTop: 16 }}>
        <Button href={requestUrl} persona="artist">Read the brief</Button>
      </div>
      <Small>
        You can respond with existing work, a placement or a commission proposal from the brief
        page. There is no obligation to respond.
      </Small>
    </EmailShell>
  );
}

export const mock: ArtistBriefInvitationProps = {
  firstName: "Maya",
  venueName: "The Copper Kettle",
  requestTitle: "Coffee shop wall",
  briefExcerpt:
    "We have a 3m wall behind the counter and would love something warm and abstract to go with the brickwork.",
  requestUrl: "https://wallplace.co.uk/artist-portal/artwork-requests/arq_example",
  intentLabel: "Purchase, QR-enabled display",
  budgetLabel: "£300 to £900",
  timescaleLabel: "Within a few weeks",
};

const entry: TemplateEntry<ArtistBriefInvitationProps> = {
  id: "artist_brief_invitation",
  name: "Brief invitation (to artist)",
  description: "A venue named this artist on the invite list of a brief they posted.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} would like you to respond to a brief",
  previewText: "Read the brief and respond from your portal.",
  component: ArtistBriefInvitation,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
