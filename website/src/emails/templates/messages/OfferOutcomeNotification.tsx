// Stream: tx (orders_and_payouts). The other half of OfferReceivedNotification:
// the OUTCOME of a purchase offer, sent to the counterparty of whoever acted.
//
// Until this existed, accept, decline and withdraw produced a bell and a line
// in the thread and no email at all, while the venue whose offer was accepted
// has a payment step to complete. Money, so it rides the critical always-send
// category, the same as the offer that opened the negotiation.

import { EmailShell, H1, P, Button, Small, InfoBox, SupportBlock, Divider, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export type OfferOutcome = "accepted" | "declined" | "withdrawn";

export interface OfferOutcomeNotificationProps {
  firstName: string;
  /** Whether the recipient is the artist or the buying venue. Drives the copy. */
  recipientRole: "artist" | "venue";
  /** Display name of the party who acted: accepted, declined or withdrew. */
  counterpartyName: string;
  /** Pre-formatted price like "£1,250.00". */
  formattedAmount: string;
  outcome: OfferOutcome;
  /** True when the row that was acted on was a counter offer. */
  isCounter?: boolean;
  /** What the offer was on, when known: a work title or a collection name. */
  itemTitle?: string;
  /** The recipient's offers page. */
  offersUrl: string;
  /** Accepted offers with a venue recipient only: the checkout deep link. */
  paymentUrl?: string;
  /**
   * The offer's deadline, formatted like "10 September 2026", from
   * purchase_offers.expires_at. Shown on an accepted offer so the venue sees
   * the window the deal was struck in.
   */
  offerDeadline?: string;
  supportUrl?: string;
}

const BADGE_TONE: Record<OfferOutcome, "success" | "neutral"> = {
  accepted: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

export function OfferOutcomeNotification({
  firstName,
  recipientRole,
  counterpartyName,
  formattedAmount,
  outcome,
  isCounter = false,
  itemTitle,
  offersUrl,
  paymentUrl,
  offerDeadline,
  supportUrl,
}: OfferOutcomeNotificationProps) {
  const offerNoun = isCounter ? "counter offer" : "offer";
  const onItem = itemTitle ? ` for “${itemTitle}”` : "";
  const venuePays = outcome === "accepted" && recipientRole === "venue";

  let headline: string;
  let intro: string;
  let badge: string;
  if (outcome === "accepted") {
    badge = "Accepted";
    headline = `Your ${offerNoun} was accepted`;
    intro = venuePays
      ? `${counterpartyName} accepted your ${offerNoun} of ${formattedAmount}${onItem}. Complete payment to make it yours.`
      : `${counterpartyName} accepted your ${offerNoun} of ${formattedAmount}${onItem}. They can now pay for the work, and you will get a separate note the moment they do.`;
  } else if (outcome === "declined") {
    badge = "Declined";
    headline = `Your ${offerNoun} was declined`;
    intro = `${counterpartyName} declined your ${offerNoun} of ${formattedAmount}${onItem}.`;
  } else {
    badge = "Withdrawn";
    headline = `${counterpartyName} withdrew their ${offerNoun}`;
    intro = `${counterpartyName} has withdrawn their ${offerNoun} of ${formattedAmount}${onItem}. Nothing more is needed from you.`;
  }

  const ctaHref = venuePays && paymentUrl ? paymentUrl : offersUrl;
  const ctaLabel = venuePays && paymentUrl ? "Complete payment" : outcome === "accepted" ? "View offer" : "View offers";

  return (
    <EmailShell
      stream="tx"
      persona={recipientRole}
      category="orders_and_payouts"
      preview={`${counterpartyName} ${outcome} the ${offerNoun} of ${formattedAmount}`}
    >
      <H1>
        <Badge tone={BADGE_TONE[outcome]}>{badge}</Badge>{" "}
        <span style={{ marginLeft: 6 }}>{headline}</span>
      </H1>
      <P>Hi {firstName}, {intro}</P>
      {outcome === "accepted" && (
        <InfoBox tone="neutral">
          <strong>Amount:</strong> {formattedAmount}
          {itemTitle && (
            <>
              <br />
              <strong>Work:</strong> {itemTitle}
            </>
          )}
          {offerDeadline && (
            <>
              <br />
              <strong>Offer deadline:</strong> {offerDeadline}
            </>
          )}
        </InfoBox>
      )}
      <Button href={ctaHref} persona={recipientRole}>{ctaLabel}</Button>
      {venuePays && (
        <Small>The work is only yours once payment has gone through, so it is worth doing this now.</Small>
      )}
      {outcome === "declined" && (
        <Small>You can send a revised {offerNoun} from your offers page if you would like to try again.</Small>
      )}
      <Divider />
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OfferOutcomeNotificationProps = {
  firstName: "Hannah",
  recipientRole: "venue",
  counterpartyName: "Maya Chen",
  formattedAmount: "£1,250.00",
  outcome: "accepted",
  isCounter: false,
  itemTitle: "Last Light on Mare Street",
  offersUrl: "https://wallplace.co.uk/venue-portal/offers",
  paymentUrl: "https://wallplace.co.uk/venue-portal/offers?pay=off_example",
  offerDeadline: "10 September 2026",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OfferOutcomeNotificationProps> = {
  id: "offer_outcome_notification",
  name: "Offer outcome notification",
  description: "Sent to the counterparty when a purchase offer is accepted, declined or withdrawn.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "{{counterpartyName}} {{outcome}} the offer of {{formattedAmount}}",
  previewText: "Open to see what happens next.",
  component: OfferOutcomeNotification,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
