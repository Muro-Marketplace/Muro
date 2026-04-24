// Stream: tx. Unhappy path — reason + fix link.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPayoutFailedProps {
  firstName: string;
  payoutAmount: Money;
  reason: string;
  fixPayoutUrl: string;
  supportUrl?: string;
}

export function ArtistPayoutFailed({ firstName, payoutAmount, reason, fixPayoutUrl, supportUrl }: ArtistPayoutFailedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Payout of ${formatMoney(payoutAmount)} couldn't be sent`}>
      <H1>Payout couldn&rsquo;t be sent</H1>
      <P>Hi {firstName} — your {formatMoney(payoutAmount)} payout failed. No money has left our account, and we&rsquo;ll retry once the issue is fixed.</P>
      <InfoBox tone="danger">
        <strong>Reason:</strong> {reason}
      </InfoBox>
      <Button href={fixPayoutUrl} persona="artist">Fix payout details</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistPayoutFailedProps = {
  firstName: "Maya",
  payoutAmount: { amount: 21600, currency: "GBP" },
  reason: "Stripe flagged your bank details as invalid. Please re-enter them.",
  fixPayoutUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistPayoutFailedProps> = {
  id: "artist_payout_failed",
  name: "Payout failed",
  description: "Payout could not be sent — action required.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Payout couldn't be sent",
  previewText: "Fix your details to retry.",
  component: ArtistPayoutFailed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
