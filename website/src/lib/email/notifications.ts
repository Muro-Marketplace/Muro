// Customer-facing notification sends that more than one route needs.
//
// 09 §B.4 and item 2.2. `sendMessageUnreadEmail` lived inline in
// `api/messages/route.ts` and `api/enquiry/route.ts` had its own copy of the
// same send. They had drifted in three ways, each visible to a real person:
//
//   1. `messages` truncated the preview at 200 characters; `enquiry` did not, so
//      a long enquiry shipped whole into a block sized for a preview.
//   2. `messages` keyed the send on `Date.now()`. That is not an idempotency
//      key: a Vercel retry of the same request sent a second email. `enquiry`
//      keyed on the CONVERSATION, so a genuine second enquiry in an existing
//      thread was silently dropped as a duplicate. Both wrong, oppositely.
//   3. Different subject lines for the same event.
//
// One function, keyed on the message row, truncating once.

import { sendEmail, type SendEmailResult } from "./send";
import { MessageUnreadNotification } from "@/emails/templates/messages/MessageUnreadNotification";

/** Matches the space the template's preview block is designed for. */
const PREVIEW_CHARS = 200;

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

export interface MessageUnreadInput {
  /** The `messages` row id. The dedupe key, so one message means one email. */
  messageId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  recipientName: string | null;
  senderName: string;
  messagePreview: string;
  conversationId: string;
  /** Extra context for the email_events row. */
  metadata?: Record<string, unknown>;
}

export function previewOf(text: string): string {
  const t = (text ?? "").trim();
  return t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS - 3)}…` : t;
}

export async function sendMessageUnreadEmail(input: MessageUnreadInput): Promise<SendEmailResult> {
  const site = siteOrigin();
  return sendEmail({
    idempotencyKey: `message_unread:${input.messageId}`,
    template: "message_unread_notification",
    category: "messages",
    to: input.recipientEmail,
    userId: input.recipientUserId ?? undefined,
    subject: `${input.senderName} sent you a message`,
    react: MessageUnreadNotification({
      firstName: (input.recipientName || "there").trim().split(" ")[0] || "there",
      senderName: input.senderName,
      messagePreview: previewOf(input.messagePreview),
      conversationUrl: `${site}/artist-portal/messages?c=${encodeURIComponent(input.conversationId)}`,
      muteMessagesUrl: `${site}/account/email`,
    }),
    metadata: { conversationId: input.conversationId, ...input.metadata },
  });
}
