// ADDITION — Wallplace has a /waitlist page, so signups deserve a polished
// confirmation. Stream: tx (relational confirmation, not marketing).

import { EmailShell, H1, P, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerWaitlistConfirmationProps {
  firstName: string;
  positionLabel?: string;
}

export function CustomerWaitlistConfirmation({ firstName, positionLabel }: CustomerWaitlistConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview="You're on the Wallplace waitlist">
      <H1>You&rsquo;re on the list</H1>
      <P>Thanks for joining the waitlist, {firstName}. We&rsquo;ll email you the moment you&rsquo;re in.</P>
      {positionLabel && <P>Your spot: <strong>{positionLabel}</strong>.</P>}
      <Small>No spam. Just one email when it&rsquo;s your turn.</Small>
    </EmailShell>
  );
}

export const mock: CustomerWaitlistConfirmationProps = {
  firstName: "Oliver",
  positionLabel: "#247",
};

const entry: TemplateEntry<CustomerWaitlistConfirmationProps> = {
  id: "customer_waitlist_confirmation",
  name: "Waitlist confirmation",
  description: "Confirms waitlist signup.",
  stream: "tx",
  persona: "customer",
  category: "security",
  subject: "You're on the Wallplace waitlist",
  previewText: "We'll be in touch when it's your turn.",
  component: CustomerWaitlistConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
