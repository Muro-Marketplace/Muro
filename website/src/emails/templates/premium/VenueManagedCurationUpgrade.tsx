// Stream: news. Managed curation pitch — similar to the pitch template but
// aimed at an existing subscriber upgrading tier.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueManagedCurationUpgradeProps {
  firstName: string;
  venueName: string;
  managedCurationBenefits: string[];
  upgradeUrl: string;
}

export function VenueManagedCurationUpgrade({ firstName, venueName, managedCurationBenefits, upgradeUrl }: VenueManagedCurationUpgradeProps) {
  return (
    <EmailShell stream="news" persona="venue" category="promotions" preview={`Let us handle the curation at ${venueName}`}>
      <H1>Curation, done for you</H1>
      <P>Hi {firstName} — upgrade to managed curation and we handle {venueName}&rsquo;s art programme end-to-end.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {managedCurationBenefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Button href={upgradeUrl} persona="venue">See managed curation</Button>
    </EmailShell>
  );
}

export const mock: VenueManagedCurationUpgradeProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  managedCurationBenefits: [
    "A human curator assigned to your space",
    "Quarterly rotations arranged, installed, and collected",
    "Insurance and consignment records handled centrally",
  ],
  upgradeUrl: "https://wallplace.co.uk/venue-portal/curation",
};

const entry: TemplateEntry<VenueManagedCurationUpgradeProps> = {
  id: "venue_managed_curation_upgrade",
  name: "Managed curation upgrade",
  description: "Upgrade path to managed curation.",
  stream: "news",
  persona: "venue",
  category: "promotions",
  subject: "Let us handle the curation at {{venueName}}",
  previewText: "End-to-end, done for you.",
  component: VenueManagedCurationUpgrade,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
