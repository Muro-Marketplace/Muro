// Stream: notify. Confirmation receipt to the VENUE that their placement
// request reached the artist. The mirror of ArtistPlacementRequestSent: the
// artist-initiated half of the flow has had a receipt since K1, and a comment
// in placements/route.ts recorded that the venue-initiated half did not.
//
// A venue-initiated request is never laid out on a wall first (wall proposals
// are something an artist makes on a venue's wall), so this template only
// shows a capture when it is handed BOTH a preview URL and a wall name, and
// the route passes neither. It must never claim a preview that does not exist.

import { Img, Link } from "@react-email/components";
import { EmailShell, H1, P, Button, InfoBox, Small, theme } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePlacementRequestSentProps {
  firstName: string;
  artistName: string;
  placementUrl: string;
  requestedWorks: string[];
  proposedTerms: string;
  /** Only rendered together with wallName. See the header comment. */
  wallPreviewUrl?: string;
  wallName?: string;
}

export function VenuePlacementRequestSent({
  firstName,
  artistName,
  placementUrl,
  requestedWorks,
  proposedTerms,
  wallPreviewUrl,
  wallName,
}: VenuePlacementRequestSentProps) {
  const showProposal = !!wallPreviewUrl && !!wallName;
  return (
    <EmailShell stream="notify" persona="venue" category="placements" preview={`Request sent to ${artistName}`}>
      <H1>Request sent to {artistName}</H1>
      <P>
        Hi {firstName}, we&rsquo;ve delivered your request. We&rsquo;ll let you know as soon as{" "}
        {artistName} responds.
      </P>
      <InfoBox tone="neutral">
        <strong>Works:</strong> {requestedWorks.join(", ")}
        <br />
        <strong>Terms you proposed:</strong> {proposedTerms}
      </InfoBox>
      {showProposal && (
        <div style={{ margin: "16px 0" }}>
          <Link href={placementUrl}>
            <Img
              src={wallPreviewUrl}
              alt={`The work previewed on your ${wallName} wall`}
              width={560}
              style={{ display: "block", width: "100%", maxWidth: 560, height: "auto", borderRadius: 3, border: `1px solid ${theme.border}` }}
            />
          </Link>
          <Small>{`The proposal on your ${wallName} wall, as previewed.`}</Small>
        </div>
      )}
      <Button href={placementUrl} persona="venue">View request</Button>
      <Small>The artist can accept, counter or decline. Either way, you will hear from us.</Small>
    </EmailShell>
  );
}

export const mock: VenuePlacementRequestSentProps = {
  firstName: "Hannah",
  artistName: "Maya Chen",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  requestedWorks: ["Last Light on Mare Street"],
  proposedTerms: "Paid loan · £120/mo",
};

const entry: TemplateEntry<VenuePlacementRequestSentProps> = {
  id: "venue_placement_request_sent",
  name: "Placement request sent (to venue)",
  description: "Venue's own confirmation that their request to an artist went out.",
  stream: "notify",
  persona: "venue",
  category: "placements",
  subject: "Request sent to {{artistName}}",
  previewText: "We'll email you the moment they respond.",
  component: VenuePlacementRequestSent,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
