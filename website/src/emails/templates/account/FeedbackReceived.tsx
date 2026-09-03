// Stream: tx. Acknowledgement to whoever just sent feedback or a feature
// request through the feedback bubble or the feature-requests page.
//
// Until this existed both forms stored the submission and told the sender
// nothing, so a submission that landed and one that silently failed looked
// identical from their side. Modelled on SupportRequestReceived, with one
// deliberate difference: that template promises a reply within N working
// days, which is true of a support request and not of feedback. This one
// promises only what happens: the team reads it.

import { EmailShell, H1, P, Small, InfoBox, QuoteBlock, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export type FeedbackSubmissionType = "feedback" | "feature request";

export interface FeedbackReceivedProps {
  firstName: string;
  referenceId: string;
  submittedType: FeedbackSubmissionType;
  messageExcerpt: string;
  supportUrl?: string;
}

export function FeedbackReceived({
  firstName,
  referenceId,
  submittedType,
  messageExcerpt,
  supportUrl,
}: FeedbackReceivedProps) {
  const isRequest = submittedType === "feature request";
  return (
    <EmailShell stream="tx" persona="multi" preview={`Thanks for your ${submittedType}`}>
      <H1>Thanks for your {submittedType}</H1>
      <P>
        Hi {firstName}, thanks for taking the time.{" "}
        {isRequest
          ? "Every request goes to the team, and the ones that keep coming up shape what we build next."
          : "Every piece of feedback goes to the team, and we read all of it."}
      </P>
      <InfoBox tone="info">
        <strong>Your reference</strong>
        <div style={{ marginTop: 4 }}>{referenceId}</div>
        <div style={{ marginTop: 8 }}>Type: {isRequest ? "Feature request" : "Feedback"}</div>
      </InfoBox>
      <P>Here&rsquo;s what you sent, so you know it arrived intact:</P>
      <QuoteBlock>{messageExcerpt}</QuoteBlock>
      <Small>
        We don&rsquo;t reply to every submission. If you need an answer, contact support and quote
        the reference above.
      </Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: FeedbackReceivedProps = {
  firstName: "Jo",
  referenceId: "8f2c1d64-0f6b-4f1e-9a2c-7d3b5e9a1c40",
  submittedType: "feature request",
  messageExcerpt: "Calendar sync: add iCal export so I can subscribe to my placements in Google Calendar.",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<FeedbackReceivedProps> = {
  id: "feedback_received",
  name: "Feedback or feature request received",
  description: "Acknowledgement to whoever submitted feedback or a feature request.",
  stream: "tx",
  persona: "multi",
  // Same reasoning as SupportRequestReceived: an acknowledgement to someone
  // who just typed their address into a form must not be suppressible by a
  // preference row they have never seen. The per-recipient flood cap at the
  // send site (unverifiedRecipientAllowed) is what stops the form being used
  // as a relay.
  category: "orders_and_payouts",
  subject: "Thanks for your {{submittedType}}",
  previewText: "We've got it, and the team will read it.",
  component: FeedbackReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
