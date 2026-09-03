// Stream: tx. The subscription has actually ended: customer.subscription.deleted.
//
// subscription_cancelled used to be sent from that event, with copy saying the
// plan was "scheduled to end on X, you keep full access until then". By the
// time Stripe deletes a subscription the access has already gone, so the email
// was never true when it arrived, and nothing at all was sent at the moment the
// artist actually cancelled. subscription_cancelled now fires at the cancel
// moment (customer.subscription.updated with cancel_at_period_end); this one
// says what is true when the period runs out.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SubscriptionEndedProps {
  firstName: string;
  planName: string;
  endedAt: string;
  resubscribeUrl: string;
  supportUrl?: string;
}

export function SubscriptionEnded({ firstName, planName, endedAt, resubscribeUrl, supportUrl }: SubscriptionEndedProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`Your ${planName} subscription has ended`}>
      <H1>Your {planName} subscription has ended</H1>
      <P>
        Hi {firstName}, your {planName} subscription ended on <strong>{endedAt}</strong>. No
        further payments will be taken.
      </P>
      <P>
        While you are not subscribed your portfolio is not shown in the public marketplace.
        Resubscribe whenever you like and your work is listed again straight away, exactly as
        you left it.
      </P>
      <Button href={resubscribeUrl} persona="artist">Resubscribe</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SubscriptionEndedProps = {
  firstName: "Maya",
  planName: "Premium",
  endedAt: "24 May 2026",
  resubscribeUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<SubscriptionEndedProps> = {
  id: "subscription_ended",
  name: "Subscription ended",
  description: "Access has ended after a cancellation ran its course (customer.subscription.deleted).",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Your {{planName}} subscription has ended",
  previewText: "No further payments will be taken.",
  component: SubscriptionEnded,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
