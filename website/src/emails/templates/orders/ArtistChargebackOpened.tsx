// Stream: tx (orders_and_payouts). To the ARTIST when a buyer's bank opens a
// chargeback on their order (charge.dispute.created).
//
// The webhook held the artist's legs and alerted an operator, and the artist
// found out only when the payout did not arrive. A chargeback is a money event
// with a deadline, and the artist is often the one holding the evidence
// (tracking, photos of the piece as sent), so they need to hear early. The
// admin alert stays; this is the artist's copy of the same fact.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

/**
 * Stripe's dispute reason codes, in the buyer's terms. The codes are what the
 * bank sends; nobody outside a payments team reads "product_unacceptable".
 * Shared by the send site and the mock so the two cannot drift.
 */
export function describeDisputeReason(reason: string | null | undefined): string {
  switch (reason) {
    case "product_not_received":
      return "They say the order did not arrive.";
    case "product_unacceptable":
      return "They say the piece was damaged or not as described.";
    case "fraudulent":
    case "unrecognized":
      return "They say they did not recognise the charge.";
    case "duplicate":
      return "They say they were charged twice.";
    case "credit_not_processed":
      return "They say a refund they expected was never received.";
    default:
      return "Their bank has not given a specific reason.";
  }
}

export interface ArtistChargebackOpenedProps {
  firstName: string;
  orderNumber: string;
  amount: Money;
  /** Plain English, from describeDisputeReason. */
  reasonText: string;
  evidenceDueBy: string;
  ordersUrl: string;
  supportUrl?: string;
}

export function ArtistChargebackOpened({
  firstName,
  orderNumber,
  amount,
  reasonText,
  evidenceDueBy,
  ordersUrl,
  supportUrl,
}: ArtistChargebackOpenedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`A chargeback has been opened on order ${orderNumber}`}>
      <H1>A chargeback has been opened on order {orderNumber}</H1>
      <P>
        Hi {firstName}, the buyer of order <strong>{orderNumber}</strong> has disputed the{" "}
        {formatMoney(amount)} payment with their bank. {reasonText}
      </P>
      <InfoBox tone="warning">
        <strong>What this means for you</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>
            Your payout for this order is on hold while the case is open. Nothing has been taken
            from your account.
          </li>
          <li>We respond to the bank on your behalf. Evidence is due by {evidenceDueBy}.</li>
          <li>
            If you have proof of dispatch, tracking, or photos of the piece as it was sent, reply
            to this email or contact support as soon as you can. It makes the difference.
          </li>
        </ul>
      </InfoBox>
      <P>We will email you when the bank decides. Most cases take a few weeks.</P>
      <Button href={ordersUrl} persona="artist">View your orders</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistChargebackOpenedProps = {
  firstName: "Maya",
  orderNumber: "WS-J6CRQS4XTX2DJRO7",
  amount: { amount: 24000, currency: "GBP" },
  reasonText: describeDisputeReason("product_not_received"),
  evidenceDueBy: "12 May 2026",
  ordersUrl: "https://wallplace.co.uk/artist-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistChargebackOpenedProps> = {
  id: "artist_chargeback_opened",
  name: "Chargeback opened (to artist)",
  description: "A buyer's bank has opened a dispute; the artist's payout is held and evidence has a deadline.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "A chargeback has been opened on order {{orderNumber}}",
  previewText: "Your payout is held while the case is open.",
  component: ArtistChargebackOpened,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
