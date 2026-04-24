// Stream: tx. Fully-signed contract — receipt copy for both parties.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementContractCountersignedProps {
  firstName: string;
  placementUrl: string;
  contractUrl: string;
  signedAt: string;
  counterpartyName: string;
}

export function PlacementContractCountersigned({ firstName, placementUrl, contractUrl, signedAt, counterpartyName }: PlacementContractCountersignedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Contract countersigned by ${counterpartyName}`}>
      <H1>Contract countersigned</H1>
      <P>Hi {firstName} — {counterpartyName} has countersigned on {signedAt}. You can download a copy below.</P>
      <InfoBox tone="neutral">Keep this email for your records. A copy lives in your placement page too.</InfoBox>
      <Button href={contractUrl}>Download contract</Button>
      <P style={{ marginTop: 16 }}>
        <a href={placementUrl} style={{ color: "#6B6760", fontSize: 12, textDecoration: "underline" }}>Open placement</a>
      </P>
    </EmailShell>
  );
}

export const mock: PlacementContractCountersignedProps = {
  firstName: "Maya",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  contractUrl: "https://wallplace.co.uk/placements/p_example/contract.pdf",
  signedAt: "24 April 2026",
  counterpartyName: "The Curzon",
};

const entry: TemplateEntry<PlacementContractCountersignedProps> = {
  id: "placement_contract_countersigned",
  name: "Contract countersigned",
  description: "Fully-signed contract receipt.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Contract countersigned by {{counterpartyName}}",
  previewText: "Download a copy for your records.",
  component: PlacementContractCountersigned,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
