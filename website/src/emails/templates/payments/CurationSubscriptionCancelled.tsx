// Stream: tx. Cancellation confirmation to the venue whose programme or
// managed-curation subscription Stripe has just ended.
//
// customer.subscription.deleted fires when the subscription has actually
// ended, so unlike SubscriptionCancelled (the artist plan template, which
// says "you keep access until the period ends") the copy here is past tense:
// it is over, no further payment will be taken, and here is what happens to
// the work on the walls. Until this existed only the admin was told
// (src/lib/curation/billing.ts, handleCurationSubscriptionDeleted).

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";
import { curationKindLabel, type CurationSubscriptionKind } from "./CurationPaymentFailed";

export interface CurationSubscriptionCancelledProps {
  contactFirstName: string;
  venueName: string;
  kind: CurationSubscriptionKind;
  /** Already formatted for display, e.g. "4 September 2026". */
  endedOn: string;
  /** Where a venue starts again: the Curated page, which leads to a fresh quote. */
  restartUrl: string;
  supportUrl?: string;
}

export function CurationSubscriptionCancelled({
  contactFirstName,
  venueName,
  kind,
  endedOn,
  restartUrl,
  supportUrl,
}: CurationSubscriptionCancelledProps) {
  const label = curationKindLabel(kind);
  return (
    <EmailShell stream="tx" persona="venue" preview={`Your ${label} has ended`}>
      <H1>Your {kind === "programme" ? "programme" : "curation subscription"} has ended</H1>
      <P>
        Hi {contactFirstName}, the {label} for {venueName} was cancelled on{" "}
        <strong>{endedOn}</strong>. No further payments will be taken.
      </P>
      <InfoBox tone="neutral">
        <strong>Venue:</strong> {venueName}
        <br />
        <strong>Ended:</strong> {endedOn}
      </InfoBox>
      {kind === "programme" ? (
        <P>
          Curation for {venueName} stops here. If work from the programme is still on your walls,
          our team will be in touch to arrange what happens next; nothing needs collecting today.
        </P>
      ) : (
        <P>Curation work for {venueName} stops here.</P>
      )}
      <P>If this was a mistake, or you would like to start again later, we can set up a new quote.</P>
      <Button href={restartUrl} persona="venue">
        Start again
      </Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: CurationSubscriptionCancelledProps = {
  contactFirstName: "Sam",
  venueName: "Riverside Offices",
  kind: "programme",
  endedOn: "4 September 2026",
  restartUrl: "https://wallplace.co.uk/curated",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CurationSubscriptionCancelledProps> = {
  id: "curation_subscription_cancelled",
  name: "Programme or curation: cancelled",
  description:
    "Confirmation to the paying venue once Stripe has ended a programme or managed-curation subscription.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Your Wallplace programme has ended",
  previewText: "No further payments will be taken.",
  component: CurationSubscriptionCancelled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
