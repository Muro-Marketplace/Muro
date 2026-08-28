// Stream: tx. Warns the artist their fee-free window is about to lapse.
//
// WS3.5 (audit R7 row 14, the other half): the referral window expired
// silently, so an artist pricing work around a 0% platform fee was re-charged
// the standard fee mid-programme with no warning and no surface showing the
// date. Sent by the referral-window cron a few days before free_until.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ReferralWindowEndingProps {
  firstName: string;
  /** Formatted end of the fee-free window, e.g. "26 September 2026". */
  freeUntilDate: string;
  /** The fee that resumes afterwards, e.g. "15%". */
  standardFee: string;
  billingUrl: string;
  supportUrl?: string;
}

export function ReferralWindowEnding({
  firstName,
  freeUntilDate,
  standardFee,
  billingUrl,
  supportUrl,
}: ReferralWindowEndingProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview="Your fee-free window ends soon">
      <H1>Your fee-free window ends soon, {firstName}</H1>
      <P>
        A quick heads-up so nothing changes without warning: the 0% platform fee you earned
        through referrals runs until the date below. Sales confirmed after that date carry
        the standard {standardFee} platform fee again.
      </P>
      <InfoBox tone="warning">
        <strong>Fee-free until:</strong> {freeUntilDate}
      </InfoBox>
      <P>
        Refer another artist who starts a paid plan and the window extends by 30 days.
        Your referral code is on your billing page.
      </P>
      <Button href={billingUrl}>View your billing page</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ReferralWindowEndingProps = {
  firstName: "Fin",
  freeUntilDate: "26 September 2026",
  standardFee: "15%",
  billingUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ReferralWindowEndingProps> = {
  id: "referral_window_ending",
  name: "Referral: fee-free window ending",
  description: "Warns the artist their 0% fee window lapses soon and the standard fee resumes.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Your fee-free window ends soon",
  previewText: "Sales after the end date carry the standard platform fee again.",
  component: ReferralWindowEnding,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
