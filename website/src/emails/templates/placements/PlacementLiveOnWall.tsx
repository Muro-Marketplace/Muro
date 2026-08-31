// Stream: notify. Both parties, when a placement goes live on the wall.
//
// Production pass 2, P4: "No email on 'live on wall', though every other
// placement stage emails both parties." Scheduled, Installed and Collected each
// fan out to the artist and the venue; the one stage in between, and the one
// that starts the arrangement actually earning, went out silently.
//
// It is not a duplicate of "Artwork installed". Installed means the piece is
// hung. Live means it is on display with its QR label up, which is the moment
// the venue's share and the artist's exposure begin, and for a paid loan the
// moment the monthly fee is buying something.

import { EmailShell, H1, P, Button, SecondaryButton } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementLiveOnWallProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  artistName: string;
  workTitle: string;
  /** Where the artist prints the QR labels for this venue. */
  qrLabelsUrl: string;
  /** The venue's share of sales from the wall, when the placement carries one. */
  venueSharePercent?: number | null;
}

export function PlacementLiveOnWall({
  firstName,
  placementUrl,
  venueName,
  artistName,
  workTitle,
  qrLabelsUrl,
  venueSharePercent,
}: PlacementLiveOnWallProps) {
  const share = typeof venueSharePercent === "number" && venueSharePercent > 0 ? venueSharePercent : null;
  return (
    <EmailShell
      stream="notify"
      persona="multi"
      category="placements"
      preview={`${workTitle} is live at ${venueName}`}
    >
      <H1>Live on the wall</H1>
      <P>
        Hi {firstName}, <strong>{workTitle}</strong> by {artistName} is now on display at{" "}
        {venueName} and open to buyers.
      </P>
      {share !== null && (
        <P>
          {venueName} takes {share}% of sales from that wall, whether a buyer scans the QR code,
          makes an offer, or buys the piece off the wall on the spot.
        </P>
      )}
      <div style={{ marginTop: 20 }}>
        <Button href={placementUrl}>View placement</Button>{" "}
        <SecondaryButton href={qrLabelsUrl}>Print QR labels</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: PlacementLiveOnWallProps = {
  firstName: "Hannah",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  workTitle: "Vietnamese Village",
  qrLabelsUrl: "https://wallplace.co.uk/artist-portal/labels?venue=the-curzon",
  venueSharePercent: 15,
};

const entry: TemplateEntry<PlacementLiveOnWallProps> = {
  id: "placement_live_on_wall",
  name: "Live on wall",
  description: "The placement is on display and open to buyers. Both parties notified.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "{{workTitle}} is live at {{venueName}}",
  previewText: "On display and open to buyers.",
  component: PlacementLiveOnWall,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
