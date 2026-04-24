// ADDITION — distinct from the onboarding nudge: Stripe has asked for more
// info mid-flow (business verification, ID check, tax forms).
// Stream: tx (orders_and_payouts) — payouts depend on this.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistStripeKycNeededProps {
  firstName: string;
  requestedDocuments: string[];
  stripeUrl: string;
  deadline?: string;
  supportUrl?: string;
}

export function ArtistStripeKycNeeded({ firstName, requestedDocuments, stripeUrl, deadline, supportUrl }: ArtistStripeKycNeededProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview="Stripe needs a little more from you to keep payouts flowing">
      <H1>Stripe needs more info</H1>
      <P>Hi {firstName} — Stripe (our payout partner) has asked for a few details to keep your account verified.</P>
      <InfoBox tone="warning">
        <strong>Requested:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {requestedDocuments.map((d) => <li key={d}>{d}</li>)}
        </ul>
        {deadline ? <><br />Please submit by <strong>{deadline}</strong> — payouts are paused until it&rsquo;s resolved.</> : null}
      </InfoBox>
      <Button href={stripeUrl} persona="artist">Complete in Stripe</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistStripeKycNeededProps = {
  firstName: "Maya",
  requestedDocuments: ["Photo ID (passport or driving licence)", "Proof of address dated within the last 3 months"],
  stripeUrl: "https://wallplace.co.uk/artist-portal/billing",
  deadline: "8 May 2026",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistStripeKycNeededProps> = {
  id: "artist_stripe_kyc_needed",
  name: "Stripe KYC needed",
  description: "Stripe requested additional verification — payouts paused.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Stripe needs more info to keep payouts flowing",
  previewText: "Short form, quick fix.",
  component: ArtistStripeKycNeeded,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
