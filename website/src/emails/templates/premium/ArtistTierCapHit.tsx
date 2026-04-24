// Stream: news (promotions). Educational upsell the first time a user hits
// a plan limit. In-app inline paywall always fires first.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistTierCapHitProps {
  firstName: string;
  currentPlan: string;
  capType: string;
  currentUsage: number;
  capLimit: number;
  upgradeUrl: string;
  benefits: string[];
}

export function ArtistTierCapHit({ firstName, currentPlan, capType, currentUsage, capLimit, upgradeUrl, benefits }: ArtistTierCapHitProps) {
  return (
    <EmailShell stream="news" persona="artist" category="promotions" preview={`You've hit the ${capType} limit on ${currentPlan}`}>
      <H1>You&rsquo;ve hit a limit</H1>
      <P>Hi {firstName} — you&rsquo;re using <strong>{currentUsage} of {capLimit}</strong> {capType} on {currentPlan}. Upgrade and the cap lifts.</P>
      <InfoBox tone="info">
        <strong>What&rsquo;s unlocked with Premium:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {benefits.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </InfoBox>
      <Button href={upgradeUrl} persona="artist">See Premium</Button>
    </EmailShell>
  );
}

export const mock: ArtistTierCapHitProps = {
  firstName: "Maya",
  currentPlan: "Core",
  capType: "artworks",
  currentUsage: 3,
  capLimit: 3,
  upgradeUrl: "https://wallplace.co.uk/pricing",
  benefits: ["Unlimited works", "Priority venue matching", "Advanced QR analytics"],
};

const entry: TemplateEntry<ArtistTierCapHitProps> = {
  id: "artist_tier_cap_hit",
  name: "Tier cap hit",
  description: "Educational upsell on limit hit.",
  stream: "news",
  persona: "artist",
  category: "promotions",
  subject: "You've hit the {{capType}} limit on {{currentPlan}}",
  previewText: "Upgrade and the cap lifts.",
  component: ArtistTierCapHit,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
