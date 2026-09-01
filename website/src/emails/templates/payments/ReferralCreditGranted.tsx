// Stream: tx. Tells the referrer their fee-free window grew.
//
// WS3.5 (audit R7 row 14): the referral credit is a real money event (the
// referrer's platform fee on sales drops to 0% until free_until), and until
// now it was recorded with a console.log only. Nobody knew they had earned
// it, which wastes the incentive, and the window then lapsed silently. This
// states the grant and the exact end date; ReferralWindowEnding covers the
// other end.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ReferralCreditGrantedProps {
  firstName: string;
  /** Display name of the artist they referred, e.g. "Maya Chen". */
  referredArtistName: string;
  /** Formatted end of the fee-free window, e.g. "26 September 2026". */
  freeUntilDate: string;
  billingUrl: string;
  supportUrl?: string;
}

export function ReferralCreditGranted({
  firstName,
  referredArtistName,
  freeUntilDate,
  billingUrl,
  supportUrl,
}: ReferralCreditGrantedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview="30 fee-free days added to your account">
      <H1>You earned 30 fee-free days, {firstName}</H1>
      <P>
        {referredArtistName} joined Wallplace with your referral code and has started a paid
        plan, so your reward is live: you pay no platform fee on your sales until the date
        below. You keep 100% of the sale price, less the venue share where one applies.
      </P>
      <InfoBox tone="info">
        <strong>Fee-free until:</strong> {freeUntilDate}
      </InfoBox>
      <P>
        Refer another artist before then and the window extends by another 30 days on top.
        Your referral code is on your billing page.
      </P>
      <Button href={billingUrl}>View your billing page</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ReferralCreditGrantedProps = {
  firstName: "Fin",
  referredArtistName: "Maya Chen",
  freeUntilDate: "26 September 2026",
  billingUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ReferralCreditGrantedProps> = {
  id: "referral_credit_granted",
  name: "Referral: fee-free window granted",
  description: "Tells the referrer their referral went paid and their 0% fee window is live.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "You earned 30 fee-free days on Wallplace",
  previewText: "Your referral started a paid plan; your platform fee is now 0%.",
  component: ReferralCreditGranted,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
