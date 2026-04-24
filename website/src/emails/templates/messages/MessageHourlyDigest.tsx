// Stream: notify. Hourly digest when multiple messages arrived within the window.

import { EmailShell, H1, P, Button, MessagePreview, Small } from "@/emails/_components";
import type { Conversation } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockConversations } from "@/emails/data/mockData";

export interface MessageHourlyDigestProps {
  firstName: string;
  conversations: Conversation[];
  inboxUrl: string;
  muteMessagesUrl: string;
}

export function MessageHourlyDigest({ firstName, conversations, inboxUrl, muteMessagesUrl }: MessageHourlyDigestProps) {
  const total = conversations.reduce((n, c) => n + c.unreadCount, 0);
  return (
    <EmailShell stream="notify" persona="multi" category="messages" preview={`${total} unread messages — from ${conversations.length} people`}>
      <H1>{total} new messages</H1>
      <P>Hi {firstName} — a round-up of what&rsquo;s waiting for you.</P>
      {conversations.slice(0, 6).map((c) => <MessagePreview key={c.id} conversation={c} />)}
      <Button href={inboxUrl}>Open inbox</Button>
      <Small>
        <a href={muteMessagesUrl} style={{ color: "#6B6760", textDecoration: "underline" }}>Change how often we send these</a>
      </Small>
    </EmailShell>
  );
}

export const mock: MessageHourlyDigestProps = {
  firstName: "Maya",
  conversations: mockConversations,
  inboxUrl: "https://wallplace.co.uk/artist-portal/messages",
  muteMessagesUrl: "https://wallplace.co.uk/account/email",
};

const entry: TemplateEntry<MessageHourlyDigestProps> = {
  id: "message_hourly_digest",
  name: "Hourly message digest",
  description: "Batches multiple new messages into one email.",
  stream: "notify",
  persona: "multi",
  category: "messages",
  subject: "{{total}} new messages on Wallplace",
  previewText: "A round-up of your inbox.",
  component: MessageHourlyDigest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
