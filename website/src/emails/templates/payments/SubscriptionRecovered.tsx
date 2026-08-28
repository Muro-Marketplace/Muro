// Stream: tx. The past_due artist paid; their portfolio is live again.
//
// WS4.4 (audit R2.2 CRITICAL, the return half): GATING_V1 delists a
// portfolio while the subscription is not live, and the dunning emails now
// say so. Recovery flipped the status back with no signal, so an artist who
// fixed their card never learned the delisting had ended. This closes the
// loop.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionRecoveredProps {
  firstName: string;
  planName: string;
  portfolioUrl: string;
  supportUrl?: string;
}

export function SubscriptionRecovered({
  firstName,
  planName,
  portfolioUrl,
  supportUrl,
}: SubscriptionRecoveredProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview="Payment received; your portfolio is live again">
      <H1>You&rsquo;re back, {firstName}</H1>
      <P>
        Your payment went through and your {planName} subscription is active again. Your
        portfolio is back in the public marketplace and buyers can find your work as normal.
      </P>
      <InfoBox tone="info">
        Nothing else changed while payments were paused: your works, placements and settings
        are exactly as you left them.
      </InfoBox>
      <Button href={portfolioUrl}>View your portfolio</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SubscriptionRecoveredProps = {
  firstName: "Fin",
  planName: "Pro",
  portfolioUrl: "https://wallplace.co.uk/artist-portal/profile",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<SubscriptionRecoveredProps> = {
  id: "subscription_recovered",
  name: "Subscription: recovered",
  description: "Payment received after past_due; the portfolio is listed again.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Payment received, your portfolio is live again",
  previewText: "Your subscription is active and your work is back in the marketplace.",
  component: SubscriptionRecovered,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
