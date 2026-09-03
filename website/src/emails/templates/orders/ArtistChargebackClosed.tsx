// Stream: tx (orders_and_payouts). To the ARTIST when the bank decides a
// chargeback (charge.dispute.closed, won or lost).
//
// Counterpart to ArtistChargebackOpened. Won: the hold is lifted. Lost: the
// sale is reversed, held legs are cancelled and, where a payout had already
// gone out, it has been reversed from their Stripe account. Both are stated
// plainly, because the artist otherwise learns the outcome from their balance.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistChargebackClosedProps {
  firstName: string;
  orderNumber: string;
  amount: Money;
  outcome: "won" | "lost";
  /** Lost only: a payout already made for this order was reversed. */
  payoutReversed?: boolean;
  ordersUrl: string;
  supportUrl?: string;
}

export function ArtistChargebackClosed({
  firstName,
  orderNumber,
  amount,
  outcome,
  payoutReversed,
  ordersUrl,
  supportUrl,
}: ArtistChargebackClosedProps) {
  if (outcome === "won") {
    return (
      <EmailShell stream="tx" persona="artist" preview={`The chargeback on order ${orderNumber} was decided in your favour`}>
        <H1>The chargeback on order {orderNumber} was decided in your favour</H1>
        <P>
          Hi {firstName}, the buyer&rsquo;s bank has closed the {formatMoney(amount)} dispute on
          order <strong>{orderNumber}</strong> in our favour.
        </P>
        <InfoBox tone="info">
          The hold on your payout has been lifted. It goes out on the usual schedule, and you will
          get a separate note when it is sent.
        </InfoBox>
        <Button href={ordersUrl} persona="artist">View your orders</Button>
        <SupportBlock supportUrl={supportUrl} />
      </EmailShell>
    );
  }
  return (
    <EmailShell stream="tx" persona="artist" preview={`The chargeback on order ${orderNumber} went the buyer's way`}>
      <H1>The chargeback on order {orderNumber} went the buyer&rsquo;s way</H1>
      <P>
        Hi {firstName}, the buyer&rsquo;s bank has sided with the buyer on the {formatMoney(amount)}{" "}
        dispute over order <strong>{orderNumber}</strong>, and the payment has been returned to
        them.
      </P>
      <InfoBox tone="danger">
        Any payout for this order that was still on hold has been cancelled.
        {payoutReversed
          ? " The payout already made for it has been reversed from your Stripe account."
          : ""}
      </InfoBox>
      <P>
        If you believe this was wrong, contact support with anything you did not send us during
        the case and we will review it.
      </P>
      <Button href={ordersUrl} persona="artist">View your orders</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistChargebackClosedProps = {
  firstName: "Maya",
  orderNumber: "WS-J6CRQS4XTX2DJRO7",
  amount: { amount: 24000, currency: "GBP" },
  outcome: "lost",
  payoutReversed: true,
  ordersUrl: "https://wallplace.co.uk/artist-portal/orders",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistChargebackClosedProps> = {
  id: "artist_chargeback_closed",
  name: "Chargeback closed (to artist)",
  description: "The bank has decided a dispute: the hold is lifted, or the sale is reversed.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "The chargeback on order {{orderNumber}} has been decided",
  previewText: "The outcome, and what it means for your payout.",
  component: ArtistChargebackClosed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
