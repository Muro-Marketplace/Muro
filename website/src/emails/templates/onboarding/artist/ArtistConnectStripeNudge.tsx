// Stream: notify. Fires day 7 if Stripe not connected.

import { EmailShell, H1, P, Button, Small, TextLink, InfoBox } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistConnectStripeNudgeProps {
  firstName: string;
  connectStripeUrl: string;
  payoutExplanationUrl: string;
}

export function ArtistConnectStripeNudge({ firstName, connectStripeUrl, payoutExplanationUrl }: ArtistConnectStripeNudgeProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview="Connect Stripe so you don't miss a payout">
      <H1>Connect your payouts, {firstName}</H1>
      <P>When a piece sells or a paid-loan invoice clears, we send the payout straight to your bank via Stripe.</P>
      <InfoBox tone="info">
        Without a connected account, sales are held until you set it up. Stripe is free and takes about two minutes.
      </InfoBox>
      <Button href={connectStripeUrl} persona="artist">Connect Stripe</Button>
      <Small><TextLink href={payoutExplanationUrl} persona="artist">How payouts work</TextLink></Small>
    </EmailShell>
  );
}

export const mock: ArtistConnectStripeNudgeProps = {
  firstName: "Maya",
  connectStripeUrl: "https://wallplace.co.uk/artist-portal/billing",
  payoutExplanationUrl: "https://wallplace.co.uk/faqs#payouts",
};

const entry: TemplateEntry<ArtistConnectStripeNudgeProps> = {
  id: "artist_connect_stripe_nudge",
  name: "Connect Stripe nudge",
  description: "Day-7 nudge for artists without a connected Stripe account.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Connect Stripe so you don't miss a payout",
  previewText: "Sales are held until payouts are set up.",
  component: ArtistConnectStripeNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
