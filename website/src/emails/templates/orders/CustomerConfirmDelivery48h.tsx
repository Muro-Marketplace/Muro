// Stream: tx. Phase 2.0c. 48-hour follow-up prompting the customer to
// confirm delivery so the payout is released. Driven by the J2 cron
// (Phase 2.3).

import { EmailShell, H1, P, Button, SecondaryButton, Small, InfoBox, Divider } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";
import { CONSUMER_RIGHTS_FOOTER } from "@/lib/email/constants";

export interface CustomerConfirmDelivery48hProps {
  firstName: string;
  orderNumber: string;
  deliveredAt: string;
  confirmUrl: string;
  reportProblemUrl: string;
  autoConfirmInDays?: number;
}

export function CustomerConfirmDelivery48h(p: CustomerConfirmDelivery48hProps) {
  const autoIn = p.autoConfirmInDays ?? 5;
  return (
    <EmailShell stream="tx" persona="customer" preview={`Did ${p.orderNumber} arrive safely?`}>
      <H1>Did everything arrive in good order?</H1>
      <P>
        Hi {p.firstName}, your order <strong>{p.orderNumber}</strong> was marked as
        delivered on {p.deliveredAt}. We have not heard back yet, so this is a quick
        nudge to confirm it arrived safely.
      </P>
      <InfoBox tone="neutral">
        If we do not hear from you within {autoIn} days, the order will auto-confirm so
        the artist can be paid. You can still raise an issue with us after that.
      </InfoBox>
      <div>
        <Button href={p.confirmUrl} persona="customer">Yes, it arrived</Button>{" "}
        <SecondaryButton href={p.reportProblemUrl} persona="customer">Something is wrong</SecondaryButton>
      </div>
      <Divider />
      <Small>{CONSUMER_RIGHTS_FOOTER}</Small>
    </EmailShell>
  );
}

export const mock: CustomerConfirmDelivery48hProps = {
  firstName: "Oliver",
  orderNumber: "WP-28473",
  deliveredAt: "Tuesday, 28 April",
  confirmUrl: "https://wallplace.co.uk/orders/WP-28473/confirm",
  reportProblemUrl: "https://wallplace.co.uk/contact?order=WP-28473",
  autoConfirmInDays: 5,
};

const entry: TemplateEntry<CustomerConfirmDelivery48hProps> = {
  id: "customer_confirm_delivery_48h",
  name: "Customer: 48h delivery prompt",
  description: "48-hour follow-up after delivery (Phase 2 lifecycle).",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Did {{orderNumber}} arrive safely?",
  previewText: "Two-minute nudge to confirm receipt.",
  component: CustomerConfirmDelivery48h,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
