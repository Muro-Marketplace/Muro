// Stream: tx (orders_and_payouts). Fired to the party currently holding the
// request after the counterparty sends revised terms.
//
// Was notify/placements. Every other response in a placement negotiation
// (accept, decline, cancel) rides the critical always-send category via
// TEMPLATE_CATEGORY_OVERRIDES, while the counter, the one step that carries
// the new money terms, could be dropped by the "Placement updates" toggle,
// vacation mode or the ten-a-day cap, all logged as ok:true skips. It is on
// the override list now, and the entry here agrees so the preview library
// tells the truth.

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
    <EmailShell stream="tx" persona="multi" category="orders_and_payouts" preview={`${counterpartyName} sent revised terms`}>
      <H1>Counter offer from {counterpartyName}</H1>
      <P>Hi {firstName}, {counterpartyName} sent back a revised offer. Here&rsquo;s what changed:</P>
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
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "{{counterpartyName}} sent revised terms",
  previewText: "Review the new offer.",
  component: PlacementCounterOfferReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
