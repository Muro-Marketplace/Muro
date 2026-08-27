// E36d — user enumeration on the public waitlist form.
//
// A duplicate email answered 409 with "This email is already on the waitlist",
// against a 200 `{success:true}` otherwise. That makes an unauthenticated
// endpoint an account-existence oracle: post an address, read the status, learn
// whether that person is on the list. Combined with E36c's spoofable rate-limit
// key the oracle was effectively unlimited.
//
// The second half is the timing channel the doc warned survives naive fixes:
// the fresh-signup path awaited `sendEmail` while the duplicate path returned
// immediately, so latency separated the two cases even with identical statuses.
// The send now runs after the response, so both branches return at the same
// point.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock, sendEmailMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  fromMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/emails/templates/customer-sales/CustomerWaitlistConfirmation", () => ({
  CustomerWaitlistConfirmation: () => null,
}));

import { POST } from "./route";

const VALID = { name: "Sam Reed", email: "sam@example.com", userType: "artist" };

function post(body: unknown): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Status + the exact bytes of the body, which is what an attacker reads. */
async function fingerprint(res: Response) {
  return { status: res.status, body: await res.text() };
}


/**
 * Let the afterResponse task run. The handler deliberately does not await it
 * (E36d: awaiting the send is what made the two branches distinguishable by
 * latency), so without this the "not called" assertions would pass vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockReset();
  sendEmailMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock });
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m1" });
});

describe("POST /api/waitlist is not an account-existence oracle (E36d)", () => {
  it("answers a duplicate email byte-identically to a fresh signup", async () => {
    const fresh = await fingerprint(await POST(post(VALID)));

    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const duplicate = await fingerprint(await POST(post(VALID)));

    expect(duplicate).toEqual(fresh);
    expect(duplicate.status).toBe(200);
  });

  it("never answers 409 on a unique-constraint violation", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const res = await POST(post(VALID));
    expect(res.status).not.toBe(409);
    expect(await res.text()).not.toContain("already on the waitlist");
  });

  it("does not re-send the confirmation to a duplicate", async () => {
    // Otherwise the endpoint mails anyone whose address you can guess.
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await POST(post(VALID));
    await flush();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still sends the confirmation on a fresh signup", async () => {
    await POST(post(VALID));
    await flush();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "sam@example.com",
      template: "customer_waitlist_confirmation",
    });
  });

  it("still surfaces a genuine database failure as a 500", async () => {
    // The oracle fix must not swallow real errors into a fake success.
    insertMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const res = await POST(post(VALID));
    await flush();
    expect(res.status).toBe(500);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still rejects a body that fails the schema", async () => {
    const res = await POST(post({ name: "x", email: "sam@example.com", userType: "nope" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
