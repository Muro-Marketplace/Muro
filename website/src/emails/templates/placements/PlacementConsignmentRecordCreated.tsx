// Stream: tx (legal-adjacent). The consignment record is a contractual
// document — both parties must have a copy.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementConsignmentRecordCreatedProps {
  firstName: string;
  placementUrl: string;
  consignmentRecordUrl: string;
  venueName: string;
  artistName: string;
  works: string[];
  termsSummary: string;
}

export function PlacementConsignmentRecordCreated({ firstName, placementUrl, consignmentRecordUrl, venueName, artistName, works, termsSummary }: PlacementConsignmentRecordCreatedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Consignment record for ${artistName} × ${venueName}`}>
      <H1>Consignment record ready</H1>
      <P>Hi {firstName} — the record for <strong>{artistName}</strong> × <strong>{venueName}</strong> has been drafted. Please review and approve.</P>
      <InfoBox tone="neutral">
        <strong>Works:</strong> {works.join(", ")}<br />
        <strong>Terms:</strong> {termsSummary}
      </InfoBox>
      <Button href={consignmentRecordUrl}>Review &amp; approve</Button>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>Open placement</a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementConsignmentRecordCreatedProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  consignmentRecordUrl: "https://wallplace.co.uk/placements/p_example?record=open",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  works: ["Last Light on Mare Street", "The Flower Seller"],
  termsSummary: "Paid loan · £120/mo · 10% rev share",
};

const entry: TemplateEntry<PlacementConsignmentRecordCreatedProps> = {
  id: "placement_consignment_record_created",
  name: "Consignment record created",
  description: "Both parties asked to review and approve the record.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Consignment record ready for {{artistName}} × {{venueName}}",
  previewText: "Review and approve inside.",
  component: PlacementConsignmentRecordCreated,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
