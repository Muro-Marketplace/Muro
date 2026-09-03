// Stream: tx. Sent when an admin flags an artist as one of the founding
// cohort (PATCH /api/admin/artists with is_founding_artist: true).
//
// The flyer promises "First 20 artists: 6 months free". The flag that makes
// it true (artist_profiles.is_founding_artist, which /api/subscribe reads to
// pick FOUNDING_TRIAL_DAYS over STANDARD_TRIAL_DAYS) was set silently, so an
// artist could be given the offer and never told. This is the confirmation.
// Every number comes from src/lib/pricing.ts, the same source the pricing
// page, the application form and the billing page quote, so it cannot drift.
//
// Only ever sent to an artist whose flag is TRUE. The ordinary approval email
// (ArtistApplicationApproved) shows the founding offer only when the artist is
// already flagged, and otherwise says nothing about six months at all.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";
import { FOUNDING_ARTIST_LIMIT, FOUNDING_TRIAL_MONTHS, trialOffer } from "@/lib/pricing";

export interface ArtistFoundingPlaceConfirmedProps {
  firstName: string;
  billingUrl: string;
  supportUrl?: string;
}

export function ArtistFoundingPlaceConfirmed({
  firstName,
  billingUrl,
  supportUrl,
}: ArtistFoundingPlaceConfirmedProps) {
  const offer = trialOffer(true);
  return (
    <EmailShell stream="tx" persona="artist" preview="Your founding place on Wallplace is confirmed">
      <H1>Your founding place is confirmed, {firstName}</H1>
      <P>
        You are one of the first {FOUNDING_ARTIST_LIMIT} artists on Wallplace, and that comes with
        the founding offer.
      </P>
      <InfoBox tone="info">
        <strong>{offer.headline}</strong>
        <br />
        {offer.detail}
      </InfoBox>
      <P>
        Nothing is charged today. Start whichever plan suits you from your billing page, and your{" "}
        {FOUNDING_TRIAL_MONTHS} free months run from the day you start it.
      </P>
      <Button href={billingUrl} persona="artist">
        Choose a plan
      </Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistFoundingPlaceConfirmedProps = {
  firstName: "Maya",
  billingUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistFoundingPlaceConfirmedProps> = {
  id: "artist_founding_place_confirmed",
  name: "Founding place confirmed",
  description:
    "Sent when an admin flags an artist as one of the founding cohort: confirms the six-months-free offer and where to start a plan.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Your founding place on Wallplace is confirmed",
  previewText: "Six months free, then billing starts. Cancel anytime.",
  component: ArtistFoundingPlaceConfirmed,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
