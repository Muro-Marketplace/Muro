// Stream: news. Venue-facing analytics upsell.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueAnalyticsUpgradeProps {
  firstName: string;
  venueName: string;
  analyticsBenefits: string[];
  upgradeUrl: string;
}

export function VenueAnalyticsUpgrade({ firstName, venueName, analyticsBenefits, upgradeUrl }: VenueAnalyticsUpgradeProps) {
  return (
    <EmailShell stream="news" persona="venue" category="promotions" preview={`See how ${venueName}'s walls really perform`}>
      <H1>See how the walls perform</H1>
      <P>Hi {firstName} — Premium analytics show you which pieces drive scans, sales, and dwell time at {venueName}.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {analyticsBenefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Button href={upgradeUrl} persona="venue">Explore analytics</Button>
    </EmailShell>
  );
}

export const mock: VenueAnalyticsUpgradeProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  analyticsBenefits: [
    "Scan heatmap by wall",
    "Visitor return-rate tied to QR interactions",
    "Comparable performance across placements",
  ],
  upgradeUrl: "https://wallplace.co.uk/venue-portal/billing",
};

const entry: TemplateEntry<VenueAnalyticsUpgradeProps> = {
  id: "venue_analytics_upgrade",
  name: "Venue analytics upgrade",
  description: "Venue analytics upsell.",
  stream: "news",
  persona: "venue",
  category: "promotions",
  subject: "See how {{venueName}}'s walls really perform",
  previewText: "Measurable rotation outcomes.",
  component: VenueAnalyticsUpgrade,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
