// Stream: notify. Sent after a 10-minute delay if the message is still unread.

import { EmailShell, H1, P, Button, QuoteBlock, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface MessageUnreadNotificationProps {
  firstName: string;
  senderName: string;
  messagePreview: string;
  conversationUrl: string;
  muteMessagesUrl: string;
}

export function MessageUnreadNotification({ firstName, senderName, messagePreview, conversationUrl, muteMessagesUrl }: MessageUnreadNotificationProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="messages" preview={`New message from ${senderName}`}>
      <H1>{senderName} sent you a message</H1>
      <P>Hi {firstName},</P>
      <QuoteBlock attribution={senderName}>{messagePreview}</QuoteBlock>
      <Button href={conversationUrl}>Open conversation</Button>
      <Small>
        Getting too many of these? <a href={muteMessagesUrl} style={{ color: "#6B6760", textDecoration: "underline" }}>Switch to a daily digest</a>.
      </Small>
    </EmailShell>
  );
}

export const mock: MessageUnreadNotificationProps = {
  firstName: "Maya",
  senderName: "Hannah at The Curzon",
  messagePreview: "Could you share framed dimensions for the lobby wall? We have roughly 2.8m of headroom.",
  conversationUrl: "https://wallplace.co.uk/artist-portal/messages?c=c_curzon_maya",
  muteMessagesUrl: "https://wallplace.co.uk/account/email",
};

const entry: TemplateEntry<MessageUnreadNotificationProps> = {
  id: "message_unread_notification",
  name: "Unread message notification",
  description: "Delay-then-email pattern for new messages.",
  stream: "notify",
  persona: "multi",
  category: "messages",
  subject: "{{senderName}} sent you a message",
  previewText: "Open to reply.",
  component: MessageUnreadNotification,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
