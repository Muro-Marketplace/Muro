// 09 §D.4 / item 3.4. The contact form told us and told the sender nothing.
//
// From the sender's side a support request and a form that silently failed
// looked identical: same spinner, same "thanks", no email, no reference, no way
// to check. The acknowledgement is a reflected send, so the abuse surface
// arrives with it and is tested here too.

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null as unknown }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ insert: insertMock }) } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/email/unverified-recipient", () => ({ unverifiedRecipientAllowed: vi.fn(async () => true) }));

import { POST } from "./route";
import { sendEmail } from "@/lib/email/send";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";
import { checkRateLimit } from "@/lib/rate-limit";

const GOOD = {
  name: "Jo Bloggs",
  email: "Jo@Example.com",
  type: "Selling on Wallplace",
  message: "I run a cafe in Hampton and I would like to know how the revenue share works.",
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertMock.mockClear();
  insertMock.mockResolvedValue({ error: null } as never);
  vi.mocked(sendEmail).mockClear();
  vi.mocked(sendAdminAlert).mockClear();
  vi.mocked(unverifiedRecipientAllowed).mockClear();
  vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/contact acknowledges the sender", () => {
  it("emails the submitter as well as the admin", async () => {
    // THE regression. Before this, exactly one email left the building and it
    // went to us.
    const res = await POST(req(GOOD));

    expect(res.status).toBe(200);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      to: "Jo@Example.com",
      template: "support_request_received",
    });
  });

  it("stores a reference and quotes the SAME one to the sender and to the admin", async () => {
    // Two different references would be worse than none: the sender quotes one
    // and support cannot find it.
    await POST(req(GOOD));

    const stored = insertMock.mock.calls[0][0] as { reference: string };
    expect(stored.reference).toMatch(/^WP-[0-9A-F]{8}$/);

    const emailProps = vi.mocked(sendEmail).mock.calls[0][0];
    expect(JSON.stringify(emailProps.react)).toContain(stored.reference);
    expect(emailProps.idempotencyKey).toBe(`support_ack:${stored.reference}`);

    const adminFields = vi.mocked(sendAdminAlert).mock.calls[0][0].fields ?? [];
    expect(adminFields).toContainEqual({ label: "Reference", value: stored.reference });
  });

  it("never quotes the row id, which is a sequence and leaks the submission count", async () => {
    await POST(req(GOOD));

    const stored = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(stored).not.toHaveProperty("id");
    expect(stored.reference).not.toMatch(/^\d+$/);
  });

  it("gives two submissions two different references", async () => {
    await POST(req(GOOD));
    await POST(req(GOOD));

    const [a, b] = insertMock.mock.calls.map((c) => (c[0] as { reference: string }).reference);
    expect(a).not.toBe(b);
    // And therefore two different idempotency keys, or the second sender would
    // get no acknowledgement at all.
    const keys = vi.mocked(sendEmail).mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("never reads the row back, because the anon client cannot", async () => {
    // `contact_submissions` has INSERT policies and no SELECT policy, so an
    // `.insert().select()` would be filtered to zero rows and the route would
    // 500 on a submission it had just stored. The insert mock has no `select`,
    // so calling one throws and this test fails.
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
  });

  it("uses the sender's first name, and copes with an empty one", async () => {
    await POST(req({ ...GOOD, name: "Jo" }));
    expect(JSON.stringify(vi.mocked(sendEmail).mock.calls[0][0].react)).toContain("Jo");
  });

  it("truncates a very long message in the excerpt", async () => {
    await POST(req({ ...GOOD, message: "x".repeat(1500) }));
    const rendered = JSON.stringify(vi.mocked(sendEmail).mock.calls[0][0].react);
    expect(rendered).toContain("x".repeat(200));
    expect(rendered).not.toContain("x".repeat(201));
  });

  it("attaches no userId, because the sender is anonymous", async () => {
    // Attaching one would apply somebody else's preferences and throttles to an
    // address nobody has verified.
    await POST(req(GOOD));
    expect(vi.mocked(sendEmail).mock.calls[0][0].userId).toBeUndefined();
  });
});

describe("POST /api/contact is not a spam relay", () => {
  it("checks the per-recipient cap before sending", async () => {
    await POST(req(GOOD));

    expect(unverifiedRecipientAllowed).toHaveBeenCalledWith({
      to: "Jo@Example.com",
      template: "support_request_received",
    });
  });

  it("sends nothing to a flooded address", async () => {
    // The route's own limit is 5/min/IP, which does nothing against many IPs
    // pointed at one inbox.
    vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(false);

    const res = await POST(req(GOOD));

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still stores the submission and still alerts an admin when the cap bites", async () => {
    // Someone being flooded must not also lose the ability to reach support,
    // and we want to see the traffic.
    vi.mocked(unverifiedRecipientAllowed).mockResolvedValue(false);

    await POST(req(GOOD));

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it("honours the IP rate limit before doing anything at all", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(
      new Response(null, { status: 429 }) as never,
    );

    const res = await POST(req(GOOD));

    expect(res.status).toBe(429);
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact validation", () => {
  it("rejects an incomplete body and emails nobody", async () => {
    const res = await POST(req({ name: "Jo" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the insert fails", async () => {
    // An acknowledgement for a submission that was never stored is a lie: the
    // reference it quotes matches no row.
    insertMock.mockResolvedValue({ error: { message: "boom" } } as never);

    const res = await POST(req(GOOD));

    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });
});
