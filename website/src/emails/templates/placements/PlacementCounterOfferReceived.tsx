// Stream: notify. Fired to the party currently holding the request after
// the counterparty sends revised terms.

import { EmailShell, H1, P, Button, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementCounterOfferReceivedProps {
  firstName: string;
  counterpartyName: string;
  placementUrl: string;
  changedTerms: string[];
  expiresAt?: string;
}

export function PlacementCounterOfferReceived({ firstName, counterpartyName, placementUrl, changedTerms, expiresAt }: PlacementCounterOfferReceivedProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`${counterpartyName} sent revised terms`}>
      <H1>Counter offer from {counterpartyName}</H1>
      <P>Hi {firstName} — {counterpartyName} sent back a revised offer. Here&rsquo;s what changed:</P>
      <InfoBox tone="info">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {changedTerms.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </InfoBox>
      <Button href={placementUrl}>Review and respond</Button>
      {expiresAt && <P style={{ fontSize: 12, color: "#6B6760" }}>Counter expires {expiresAt}.</P>}
    </EmailShell>
  );
}

export const mock: PlacementCounterOfferReceivedProps = {
  firstName: "Maya",
  counterpartyName: "The Curzon",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  changedTerms: ["Monthly fee: £140 (was £120)", "Revenue share: 12% (was 10%)"],
  expiresAt: "1 May 2026",
};

const entry: TemplateEntry<PlacementCounterOfferReceivedProps> = {
  id: "placement_counter_offer_received",
  name: "Counter offer received",
  description: "Sent to whoever needs to respond to the new terms.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "{{counterpartyName}} sent revised terms",
  previewText: "Review the new offer.",
  component: PlacementCounterOfferReceived,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
