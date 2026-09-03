// Stream: tx. Acknowledgement to whoever used the public enquiry form on an
// artist's page. Modelled on SupportRequestReceived: the enquiry went to the
// artist and to the team, and the sender got nothing back, so from their side
// a delivered enquiry and a form that silently failed looked identical.
//
// There is no user id here. The enquirer is anonymous, so no preference row,
// vacation mode or throttle can apply, and the category is the always-send
// bucket the contact-form acknowledgement already uses: an address someone
// just typed into a form must not be silenced by a preference they have never
// seen.

import { EmailShell, H1, P, Small, InfoBox, QuoteBlock, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface EnquiryReceivedProps {
  firstName: string;
  artistName: string;
  /** The work the enquiry was about, when the form named one. */
  workTitle?: string;
  /** Human label for the enquiry type, e.g. "Purchasing a work". */
  enquiryTypeLabel: string;
  messageExcerpt: string;
  artistProfileUrl: string;
  supportUrl?: string;
}

export function EnquiryReceived({
  firstName,
  artistName,
  workTitle,
  enquiryTypeLabel,
  messageExcerpt,
  artistProfileUrl,
  supportUrl,
}: EnquiryReceivedProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview={`Your enquiry has reached ${artistName}`}>
      <H1>We&rsquo;ve passed your message to {artistName}</H1>
      <P>
        Hi {firstName}, thanks for getting in touch. Your enquiry has gone straight to {artistName},
        who replies from their own inbox, so keep an eye out for a message from them.
      </P>
      <InfoBox tone="info">
        <strong>Artist:</strong> <a href={artistProfileUrl} style={{ color: "inherit" }}>{artistName}</a>
        {workTitle && (
          <>
            <br />
            <strong>About:</strong> {workTitle}
          </>
        )}
        <br />
        <strong>Enquiry type:</strong> {enquiryTypeLabel}
      </InfoBox>
      <P>Here&rsquo;s what you sent, so you know it arrived intact:</P>
      <QuoteBlock>{messageExcerpt}</QuoteBlock>
      <Small>
        If you have not heard back within a few days, reply to this email and we will give the
        artist a nudge.
      </Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: EnquiryReceivedProps = {
  firstName: "Priya",
  artistName: "Maya Chen",
  workTitle: "Last Light on Mare Street",
  enquiryTypeLabel: "Purchasing a work",
  messageExcerpt: "Is this piece still available, and could it be framed before delivery?",
  artistProfileUrl: "https://wallplace.co.uk/browse/maya-chen",
  supportUrl: "https://wallplace.co.uk/contact",
};

const entry: TemplateEntry<EnquiryReceivedProps> = {
  id: "enquiry_received",
  name: "Enquiry received",
  description: "Acknowledgement to whoever submitted the public enquiry form on an artist's page.",
  stream: "tx",
  persona: "multi",
  // The closest existing always-send bucket, for the same reason as
  // support_request_received: the recipient has no account and no
  // preferences, and the acknowledgement must not be suppressible.
  category: "orders_and_payouts",
  subject: "We've passed your message to {{artistName}}",
  previewText: "Your enquiry has reached the artist.",
  component: EnquiryReceived,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
