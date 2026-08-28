// F7/H20: sendMessageUnreadEmail hardcoded /artist-portal/messages for every
// recipient, so venues clicking "Open conversation" were bounced off the
// artist portal guard. The link now targets the recipient's own portal, and
// carries the ?c= param the inbox auto-opens.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock, templateMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => ({ ok: true as const, id: "e-1" })),
  templateMock: vi.fn(() => null),
}));

vi.mock("./send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/messages/MessageUnreadNotification", () => ({
  MessageUnreadNotification: templateMock,
}));

import { sendMessageUnreadEmail } from "./notifications";

function input(recipientPortal: "artist" | "venue") {
  return {
    messageId: "msg-1",
    recipientEmail: "r@example.com",
    recipientUserId: "u-1",
    recipientName: "Robin",
    recipientPortal,
    senderName: "alice",
    messagePreview: "hello",
    conversationId: "dm-alice__bob",
  };
}

beforeEach(() => {
  sendEmailMock.mockClear();
  templateMock.mockClear();
});

describe("sendMessageUnreadEmail links the recipient's own portal", () => {
  it("venue recipients get a venue-portal link with the conversation param", async () => {
    await sendMessageUnreadEmail(input("venue"));

    expect(templateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationUrl: expect.stringContaining("/venue-portal/messages?c=dm-alice__bob"),
      }),
    );
  });

  it("artist recipients get an artist-portal link", async () => {
    await sendMessageUnreadEmail(input("artist"));

    expect(templateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationUrl: expect.stringContaining("/artist-portal/messages?c=dm-alice__bob"),
      }),
    );
  });

  it("URL-encodes the conversation id", async () => {
    await sendMessageUnreadEmail({ ...input("artist"), conversationId: "conv/9 x" });

    expect(templateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationUrl: expect.stringContaining("?c=conv%2F9%20x"),
      }),
    );
  });
});
