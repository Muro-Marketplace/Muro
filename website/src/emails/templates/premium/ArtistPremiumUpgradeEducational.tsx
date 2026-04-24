// Stream: news. Educational — arrives 3 days after tier_cap_hit if the
// artist hasn't converted.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPremiumUpgradeEducationalProps {
  firstName: string;
  currentPlan: string;
  premiumBenefits: string[];
  upgradeUrl: string;
}

export function ArtistPremiumUpgradeEducational({ firstName, currentPlan, premiumBenefits, upgradeUrl }: ArtistPremiumUpgradeEducationalProps) {
  return (
    <EmailShell stream="news" persona="artist" category="promotions" preview="What Premium actually unlocks">
      <H1>What Premium actually unlocks</H1>
      <P>Hi {firstName} — you&rsquo;re on {currentPlan}. Here&rsquo;s the difference, plainly.</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {premiumBenefits.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <Button href={upgradeUrl} persona="artist">See pricing</Button>
    </EmailShell>
  );
}

export const mock: ArtistPremiumUpgradeEducationalProps = {
  firstName: "Maya",
  currentPlan: "Core",
  premiumBenefits: [
    "Unlimited works instead of 3",
    "Appear higher in venue searches",
    "Per-work scan + sale analytics",
    "Lower marketplace fee (5% vs 15% on Core)",
  ],
  upgradeUrl: "https://wallplace.co.uk/pricing",
};

const entry: TemplateEntry<ArtistPremiumUpgradeEducationalProps> = {
  id: "artist_premium_upgrade_educational",
  name: "Premium educational upgrade",
  description: "Follow-up after cap-hit — benefits explained.",
  stream: "news",
  persona: "artist",
  category: "promotions",
  subject: "What Premium actually unlocks",
  previewText: "The plain version.",
  component: ArtistPremiumUpgradeEducational,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
