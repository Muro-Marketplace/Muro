// The newsletter signup: an enumeration guard (E36d) and, now, double opt-in
// (09 §D.3 / item 3.5).
//
// E36d: this route was cited as the codebase's GOOD example, because it maps a
// 23505 to a 200 with a comment saying it does so "so we don't leak membership
// status to enumeration attacks". The comment overclaimed. The 200 carried
// `alreadySubscribed: true`, which is the same disclosure one level down.
//
// §D.3: `email_preferences.newsletter_enabled` has defaulted to false with the
// comment "double opt-in" since migration 016, and nothing ever set it true,
// because there was no confirmation step to set it. So subscribing did nothing
// anyone could observe, and anyone could subscribe anyone else's address.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));
vi.mock("@/lib/email/unverified-recipient", () => ({
  unverifiedRecipientAllowed: vi.fn(async () => true),
}));

import { POST } from "./route";
import { sendEmail } from "@/lib/email/send";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";

function post(body: unknown): Request {
  return new Request("http://localhost/api/newsletter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock });
  vi.mocked(sendEmail).mockClear();
  vi.mocked(unverifiedRecipientAllowed).mockClear();
  vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/newsletter is not a membership oracle (E36d)", () => {
  it("answers an existing subscriber byte-identically to a new one", async () => {
    const fresh = await (await POST(post({ email: "sam@example.com" }))).text();

    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const existing = await (await POST(post({ email: "sam@example.com" }))).text();

    expect(existing).toEqual(fresh);
  });

  it("no longer flags alreadySubscribed in the body", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const body = await (await POST(post({ email: "sam@example.com" }))).json();
    expect(body).not.toHaveProperty("alreadySubscribed");
    expect(body).toEqual({ ok: true });
  });

  it("still surfaces a genuine database failure as a 500", async () => {
    insertMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const res = await POST(post({ email: "sam@example.com" }));
    expect(res.status).toBe(500);
  });

  it("still rejects an invalid address", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/newsletter asks before it subscribes anyone (09 §D.3)", () => {
  it("stores a confirmation token with the row", async () => {
    await POST(post({ email: "Sam@Example.com" }));

    const row = insertMock.mock.calls[0][0] as { email: string; confirm_token: string };
    expect(row.email).toBe("sam@example.com");
    expect(row.confirm_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends exactly one confirmation email, carrying that token", async () => {
    await POST(post({ email: "sam@example.com" }));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    const token = (insertMock.mock.calls[0][0] as { confirm_token: string }).confirm_token;

    expect(sent.template).toBe("newsletter_subscribe_confirm");
    expect(sent.to).toBe("sam@example.com");
    expect(JSON.stringify(sent.react)).toContain(`/api/newsletter/confirm?t=${token}`);
  });

  it("does NOT mark the row confirmed on signup", async () => {
    // The entire point. A row that arrives confirmed is single opt-in wearing a
    // token.
    await POST(post({ email: "sam@example.com" }));
    expect(insertMock.mock.calls[0][0]).not.toHaveProperty("confirmed_at");
  });

  it("attaches no userId, or the send would test the flag it exists to set", async () => {
    // `newsletter_enabled` defaults to FALSE. Passing a userId would make
    // sendEmail check that preference and suppress the confirmation email whose
    // whole job is to turn it true.
    await POST(post({ email: "sam@example.com" }));
    expect(vi.mocked(sendEmail).mock.calls[0][0].userId).toBeUndefined();
  });

  it("keys the send on the token, so a retried request cannot send twice", async () => {
    await POST(post({ email: "sam@example.com" }));
    const token = (insertMock.mock.calls[0][0] as { confirm_token: string }).confirm_token;
    expect(vi.mocked(sendEmail).mock.calls[0][0].idempotencyKey).toBe(`newsletter_confirm:${token}`);
  });

  it("sends NOTHING to an address that already has a row", async () => {
    // No resend on a duplicate: it would be a way to post mail at someone by
    // repeating a form they never filled in.
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    await POST(post({ email: "sam@example.com" }));

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the insert fails for a real reason", async () => {
    insertMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    await POST(post({ email: "sam@example.com" }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("gives two signups two different tokens", async () => {
    await POST(post({ email: "a@example.com" }));
    await POST(post({ email: "b@example.com" }));

    const tokens = insertMock.mock.calls.map((c) => (c[0] as { confirm_token: string }).confirm_token);
    expect(new Set(tokens).size).toBe(2);
  });
});

describe("POST /api/newsletter is not a way to post mail at someone", () => {
  it("checks the per-recipient cap before sending", async () => {
    await POST(post({ email: "sam@example.com" }));

    expect(unverifiedRecipientAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com", template: "newsletter_subscribe_confirm" }),
    );
  });

  it("sends nothing to a flooded address, and still answers 200", async () => {
    vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(false);

    const res = await POST(post({ email: "sam@example.com" }));

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    // The row is still written, unconfirmed, which is the honest record: asked,
    // never answered.
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("answers a flooded address identically to a fresh one", async () => {
    // Otherwise the cap becomes the oracle E36d removed.
    const fresh = await (await POST(post({ email: "a@example.com" }))).text();
    vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(false);
    const flooded = await (await POST(post({ email: "a@example.com" }))).text();

    expect(flooded).toEqual(fresh);
  });
});
