// 09 §B.4 / item 2.2. Two copies of one send, drifted three ways.
//
// `api/messages` truncated the preview at 200 characters and `api/enquiry` did
// not, so a long enquiry shipped whole into a block sized for a preview.
// `api/messages` keyed the send on `Date.now()`, which is not an idempotency key
// at all: a retry of the same request sent a second email. `api/enquiry` keyed on
// the CONVERSATION, so a genuine second enquiry in an existing thread was
// silently dropped as a duplicate. Both wrong, in opposite directions.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));

import { sendMessageUnreadEmail, previewOf } from "./notifications";
import { sendEmail } from "./send";

const BASE = {
  messageId: "msg-1",
  recipientEmail: "artist@x.com",
  recipientUserId: "u-artist",
  recipientName: "Maya Chen",
  senderName: "The Copper Kettle",
  messagePreview: "Would you be interested in showing three pieces in our front room?",
  conversationId: "conv-1",
};

const sent = () => vi.mocked(sendEmail).mock.calls[0][0];

beforeEach(() => vi.mocked(sendEmail).mockClear());

describe("previewOf", () => {
  it("leaves a short message alone", () => {
    expect(previewOf("Hello there")).toBe("Hello there");
  });

  it("truncates within the 200-character budget, ellipsis included", () => {
    // 197 + "…", the length `api/messages` has always used. Kept rather than
    // rounded up to exactly 200: §B.4 says move the helper unchanged, and
    // shifting a truncation length is a behaviour change for no reason.
    const out = previewOf("x".repeat(500));
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
    expect(out.replace("…", "")).toHaveLength(197);
  });

  it("keeps a message of exactly 200 characters whole", () => {
    // Off-by-one: 200 is not "too long".
    expect(previewOf("x".repeat(200))).toHaveLength(200);
  });

  it("trims surrounding whitespace rather than spending the budget on it", () => {
    expect(previewOf("   hi   ")).toBe("hi");
  });

  it("copes with an empty message", () => {
    expect(previewOf("")).toBe("");
  });
});

describe("sendMessageUnreadEmail", () => {
  it("keys on the MESSAGE, so one message means exactly one email", async () => {
    // Not Date.now(), which made a retry send twice; not the conversation, which
    // made a second real enquiry vanish.
    await sendMessageUnreadEmail(BASE);
    expect(sent().idempotencyKey).toBe("message_unread:msg-1");
  });

  it("gives two messages in ONE conversation two different keys", async () => {
    await sendMessageUnreadEmail(BASE);
    await sendMessageUnreadEmail({ ...BASE, messageId: "msg-2" });

    const keys = vi.mocked(sendEmail).mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("sends to the recipient, under their own user id", async () => {
    await sendMessageUnreadEmail(BASE);
    expect(sent()).toMatchObject({
      to: "artist@x.com",
      userId: "u-artist",
      template: "message_unread_notification",
      category: "messages",
    });
  });

  it("uses the recipient's first name", async () => {
    await sendMessageUnreadEmail(BASE);
    expect(JSON.stringify(sent().react)).toContain("Maya");
  });

  it("falls back to 'there' when the recipient has no name", async () => {
    // `"".split(" ")[0]` is "", which renders as "Hi ,".
    for (const name of [null, "", "   "]) {
      vi.mocked(sendEmail).mockClear();
      await sendMessageUnreadEmail({ ...BASE, recipientName: name });
      expect(JSON.stringify(sent().react), String(name)).toContain("there");
    }
  });

  it("truncates the preview, so a long enquiry cannot flood the block", async () => {
    await sendMessageUnreadEmail({ ...BASE, messagePreview: "y".repeat(900) });

    const rendered = JSON.stringify(sent().react);
    expect(rendered).toContain("y".repeat(197));
    expect(rendered).not.toContain("y".repeat(201));
  });

  it("carries the conversation id into the link and the audit row", async () => {
    await sendMessageUnreadEmail(BASE);
    expect(JSON.stringify(sent().react)).toContain("c=conv-1");
    expect(sent().metadata).toMatchObject({ conversationId: "conv-1" });
  });

  it("lets a caller add its own metadata without losing the conversation", async () => {
    await sendMessageUnreadEmail({ ...BASE, metadata: { artistSlug: "maya-chen" } });
    expect(sent().metadata).toMatchObject({ conversationId: "conv-1", artistSlug: "maya-chen" });
  });

  it("passes no userId for an anonymous recipient rather than a null one", async () => {
    await sendMessageUnreadEmail({ ...BASE, recipientUserId: null });
    expect(sent().userId).toBeUndefined();
  });
});
