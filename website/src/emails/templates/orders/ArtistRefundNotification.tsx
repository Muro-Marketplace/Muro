// Stream: tx. Notifies artist of a refund; reason drives expectations.

import { EmailShell, H1, P, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistRefundNotificationProps {
  firstName: string;
  orderNumber: string;
  workTitle: string;
  refundAmount: Money;
  reason?: string;
  supportUrl?: string;
}

export function ArtistRefundNotification({ firstName, orderNumber, workTitle, refundAmount, reason, supportUrl }: ArtistRefundNotificationProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Refund on order ${orderNumber}`}>
      <H1>Refund issued on {workTitle}</H1>
      <P>Hi {firstName} — we&rsquo;ve issued a {formatMoney(refundAmount)} refund on order {orderNumber}.</P>
      {reason && (
        <InfoBox tone="warning">
          Reason from the customer: &ldquo;{reason}&rdquo;
        </InfoBox>
      )}
      <P>We&rsquo;ll reverse the corresponding payout. If you&rsquo;ve already shipped, contact support to arrange return logistics.</P>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistRefundNotificationProps = {
  firstName: "Maya",
  orderNumber: "WP-28473",
  workTitle: "Last Light on Mare Street",
  refundAmount: { amount: 24000, currency: "GBP" },
  reason: "Piece arrived damaged",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistRefundNotificationProps> = {
  id: "artist_refund_notification",
  name: "Artist refund notification",
  description: "Refund issued on an artist's order.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Refund issued on order {{orderNumber}}",
  previewText: "Payout is reversed.",
  component: ArtistRefundNotification,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
