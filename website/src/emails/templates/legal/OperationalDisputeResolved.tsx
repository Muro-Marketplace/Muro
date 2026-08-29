// G19. A dispute that names no order (a placement dispute, or one raised from
// a conversation) resolved in silence: every notification on the admin route
// was gated on `dispute.order_id`, so the person who raised the case had to
// keep checking the page to find out what had been decided.
//
// The order-shaped version of this email is OrderDisputeResolved, which needs
// an order number it can print. This one names whatever the case was attached
// to, or nothing at all. Stream: tx.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OperationalDisputeResolvedProps {
  firstName: string;
  /** What the case was about, e.g. "your placement at Copper Kettle". Optional. */
  subjectLine?: string;
  outcome: string;
  supportUrl?: string;
}

export function OperationalDisputeResolved({ firstName, subjectLine, outcome, supportUrl }: OperationalDisputeResolvedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Your Wallplace dispute has been resolved">
      <H1>Your dispute is resolved</H1>
      <P>
        Hi {firstName}, we have finished reviewing the case you raised
        {subjectLine ? ` about ${subjectLine}` : ""}.
      </P>
      <InfoBox tone="neutral">
        <strong>Outcome:</strong> {outcome}
      </InfoBox>
      <P>If something here does not look right, reply and we will take another look.</P>
      <Button href={supportUrl || "https://wallplace.co.uk/support"}>Talk to us</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OperationalDisputeResolvedProps = {
  firstName: "Maya",
  subjectLine: "your placement at Copper Kettle",
  outcome: "The venue has agreed to return the piece and cover the courier cost.",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OperationalDisputeResolvedProps> = {
  id: "operational_dispute_resolved",
  name: "Dispute resolved (no order)",
  description: "Final decision on a dispute that is not attached to an order.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Your Wallplace dispute has been resolved",
  previewText: "The outcome of the case you raised.",
  component: OperationalDisputeResolved,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
