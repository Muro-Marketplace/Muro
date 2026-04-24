// Stream: notify. Closes the loop for the artist — enables QR setup + record.

import { EmailShell, H1, P, Button, SecondaryButton, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPlacementAcceptedProps {
  firstName: string;
  venueName: string;
  placementUrl: string;
  nextSteps: string[];
  qrLabelsUrl: string;
  consignmentRecordUrl: string;
}

export function ArtistPlacementAccepted({ firstName, venueName, placementUrl, nextSteps, qrLabelsUrl, consignmentRecordUrl }: ArtistPlacementAcceptedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview={`${venueName} accepted your placement`}>
      <H1>
        <Badge tone="success">Accepted</Badge> <span style={{ marginLeft: 6 }}>{venueName} accepted</span>
      </H1>
      <P>Hi {firstName} — your placement is confirmed. A few things to get sorted next:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {nextSteps.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <div>
        <Button href={placementUrl} persona="artist">Open placement</Button>{" "}
        <SecondaryButton href={qrLabelsUrl} persona="artist">Generate QR labels</SecondaryButton>
      </div>
      <P style={{ marginTop: 20 }}>
        <a href={consignmentRecordUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>
          Review the consignment record
        </a>
      </P>
    </EmailShell>
  );
}

export const mock: ArtistPlacementAcceptedProps = {
  firstName: "Maya",
  venueName: "The Curzon",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  nextSteps: [
    "Confirm install date with The Curzon",
    "Print QR labels for each piece",
    "Finalise the consignment record",
  ],
  qrLabelsUrl: "https://wallplace.co.uk/artist-portal/labels?venue=the-curzon",
  consignmentRecordUrl: "https://wallplace.co.uk/placements/p_example?record=open",
};

const entry: TemplateEntry<ArtistPlacementAcceptedProps> = {
  id: "artist_placement_accepted",
  name: "Placement accepted (to artist)",
  description: "Fires when a venue accepts an artist-initiated request.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} accepted your placement",
  previewText: "What to do next.",
  component: ArtistPlacementAccepted,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
