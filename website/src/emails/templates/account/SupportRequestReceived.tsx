// Stream: tx. Acknowledgement to whoever just used the contact form.
//
// 09 §D.4. Until now the contact form told the Wallplace team and told the
// sender nothing, so from the sender's side a support request and a form that
// silently failed looked identical.

import { EmailShell, H1, P, Small, InfoBox, QuoteBlock, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface SupportRequestReceivedProps {
  firstName: string;
  referenceId: string;
  submittedType: string;
  messageExcerpt: string;
  expectedReplyDays: number;
  supportUrl?: string;
}

export function SupportRequestReceived({
  firstName,
  referenceId,
  submittedType,
  messageExcerpt,
  expectedReplyDays,
  supportUrl,
}: SupportRequestReceivedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="We've got your message and we'll come back to you">
      <H1>We&rsquo;ve got your message</H1>
      <P>
        Hi {firstName}, thanks for getting in touch. Someone will read this properly and reply
        within {expectedReplyDays} working {expectedReplyDays === 1 ? "day" : "days"}.
      </P>
      <InfoBox tone="info">
        <strong>Your reference</strong>
        <div style={{ marginTop: 4 }}>{referenceId}</div>
        <div style={{ marginTop: 8 }}>Subject: {submittedType}</div>
      </InfoBox>
      <P>Here&rsquo;s what you sent, so you know it arrived intact:</P>
      <QuoteBlock>{messageExcerpt}</QuoteBlock>
      <Small>Replying to this email adds to the same thread, so there&rsquo;s no need to send it again.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: SupportRequestReceivedProps = {
  firstName: "Jo",
  referenceId: "8f2c1d64-0f6b-4f1e-9a2c-7d3b5e9a1c40",
  submittedType: "Selling on Wallplace",
  messageExcerpt:
    "I run a cafe in Hampton and I would like to know how the revenue share works before I sign up.",
  expectedReplyDays: 2,
  supportUrl: "https://wallplace.co.uk/contact",
};

const entry: TemplateEntry<SupportRequestReceivedProps> = {
  id: "support_request_received",
  name: "Support request received",
  description: "Acknowledgement sent to whoever submitted the contact form.",
  stream: "tx",
  persona: "multi",
  // The closest existing always-send bucket. An acknowledgement to someone who
  // just typed their address into a form must not be suppressible by a
  // preference row they have never seen.
  category: "orders_and_payouts",
  subject: "We've got your message",
  previewText: "We'll come back to you within 2 working days.",
  component: SupportRequestReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
