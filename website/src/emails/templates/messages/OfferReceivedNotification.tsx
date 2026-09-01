// Stream: tx (orders_and_payouts). Purchase-offer notifications,
// fired when a venue makes or counters an offer on an artist's work.
//
// R4.12 (WS5.5): was notify/placements, which made a money event with an
// expiry suppressible by the "Placement updates" toggle, vacation mode and
// the 10/24h placements throttle. A purchase offer is money, so it now rides
// the critical always-send category; sendEmail() enforces this via
// TEMPLATE_CATEGORY_OVERRIDES even for send sites still passing the old one.
//
// Replaces the earlier ReviewPostedNotification reuse hack — recipients
// were getting "5-star review" subject lines for offers, which read
// like nonsense. This template says exactly what it is.

import { EmailShell, H1, P, Button, Small, SupportBlock, Divider } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OfferReceivedNotificationProps {
  firstName: string;
  /** Display name of whoever sent this offer/counter. The prop is
   *  called `venueName` for historical reasons (offers used to be
   *  venue-only outbound) but it now holds the *sender* — could be a
   *  venue on the initial offer or an artist countering. */
  venueName: string;
  /** Pre-formatted price like "£1,250.00". */
  formattedAmount: string;
  /** Optional buyer message — quoted in the body if present. */
  message?: string;
  /** True when this is a counter, false for a fresh offer. */
  isCounter: boolean;
  /** Deep-link to the recipient's offers portal page. */
  offersUrl: string;
  /** Recipient's role — drives copy + persona. */
  recipientRole: "artist" | "venue";
  supportUrl?: string;
}

export function OfferReceivedNotification({
  firstName,
  venueName,
  formattedAmount,
  message,
  isCounter,
  offersUrl,
  recipientRole,
  supportUrl,
}: OfferReceivedNotificationProps) {
  const headline = isCounter ? "Counter offer received" : "You have a new offer";
  const intro = isCounter
    ? `${venueName} sent a counter offer of ${formattedAmount}.`
    : recipientRole === "artist"
      ? `${venueName} has offered ${formattedAmount} for your work on Wallplace.`
      : `${venueName} sent ${formattedAmount} on the offer.`;

  return (
    <EmailShell
      stream="tx"
      persona={recipientRole}
      category="orders_and_payouts"
      preview={`${venueName} - ${formattedAmount}`}
    >
      <H1>{headline}</H1>
      <P>Hi {firstName} - {intro}</P>
      {message && (
        <P style={{ fontStyle: "italic", color: "#6B6760", borderLeft: "2px solid #D8D3CC", paddingLeft: 12 }}>
          &ldquo;{message}&rdquo;
        </P>
      )}
      <Button href={offersUrl}>View offer</Button>
      <Small>
        You can accept, counter, or decline from your Wallplace portal.
        {recipientRole === "venue" && " Once accepted, you can complete payment at the agreed price."}
      </Small>
      <Divider />
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OfferReceivedNotificationProps = {
  firstName: "Maya",
  venueName: "The Curzon",
  formattedAmount: "£1,250.00",
  message: "We love this piece for our reception wall - would £1,250 work?",
  isCounter: false,
  offersUrl: "https://wallplace.co.uk/artist-portal/offers",
  recipientRole: "artist",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OfferReceivedNotificationProps> = {
  id: "offer_received_notification",
  name: "Offer received notification",
  description: "Sent when a venue makes (or counters) a purchase offer on an artist's work.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "{{venueName}} offered {{formattedAmount}}",
  previewText: "Tap to review the offer.",
  component: OfferReceivedNotification,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
