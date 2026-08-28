// 09 §D.4's open question, answered.
//
// Two routes email an address an anonymous caller typed. Nothing in `sendEmail`
// caps that: the idempotency key only stops retries, the throttle needs a
// userId, and `orders_and_payouts` sets throttleCount to 0 on purpose. The
// routes' own limit is per IP, and the attack worth stopping is many IPs at one
// victim's inbox.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { unverifiedRecipientAllowed, DEFAULT_MAX_PER_HOUR } from "./unverified-recipient";

let captured: Record<string, unknown> = {};
let result: { count: number | null; error: unknown } = { count: 0, error: null };

function db() {
  const chain: Record<string, unknown> = {};
  const record = (k: string) => (a: unknown, b?: unknown) => {
    captured[k] = b === undefined ? a : [a, b];
    return chain;
  };
  chain.select = record("select");
  chain.eq = (col: string, val: unknown) => {
    captured[col] = val;
    return chain;
  };
  chain.in = record("in");
  chain.gte = (_col: string, val: unknown) => {
    captured.since = val;
    return Promise.resolve(result);
  };
  return { from: (t: string) => { captured.table = t; return chain; } } as never;
}

beforeEach(() => {
  captured = {};
  result = { count: 0, error: null };
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("unverifiedRecipientAllowed", () => {
  it("allows a first send", async () => {
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(true);
  });

  it("allows right up to the cap", async () => {
    result = { count: DEFAULT_MAX_PER_HOUR - 1, error: null };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(true);
  });

  it("refuses at the cap", async () => {
    result = { count: DEFAULT_MAX_PER_HOUR, error: null };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(false);
  });

  it("refuses well past the cap", async () => {
    result = { count: 500, error: null };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(false);
  });

  it("honours an explicit maxPerHour", async () => {
    result = { count: 1, error: null };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", maxPerHour: 1, db: db() })).toBe(false);
  });

  it("lowercases and trims the address, matching how sendEmail stores it", async () => {
    // sendEmail writes `to_email` as `input.to.trim().toLowerCase()`. Counting
    // the raw string would always find 0 rows and the guard would do nothing.
    await unverifiedRecipientAllowed({ to: "  A@X.COM  ", template: "t", db: db() });
    expect(captured.to_email).toBe("a@x.com");
  });

  it("counts only this template, so one form's flood does not block another", async () => {
    await unverifiedRecipientAllowed({ to: "a@x.com", template: "support_request_received", db: db() });
    expect(captured.template).toBe("support_request_received");
    expect(captured.table).toBe("email_events");
  });

  it("counts only sends that actually happened", async () => {
    // A suppressed or opted-out row is not mail anybody received, so counting it
    // would let a suppression turn into a denial of service on that address.
    await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() });
    expect(captured.in).toEqual(["status", ["sent", "queued"]]);
  });

  it("looks back exactly one hour by default", async () => {
    const before = Date.now();
    await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() });
    const since = new Date(captured.since as string).getTime();
    expect(before - since).toBeGreaterThanOrEqual(3_600_000 - 50);
    expect(before - since).toBeLessThan(3_600_000 + 5_000);
  });

  it("fails OPEN on a database error", async () => {
    // This is an abuse guard, not a correctness gate. A Supabase blip must not
    // silently stop a real person's acknowledgement, and the route's own IP
    // limit is still in front of it.
    result = { count: null, error: { message: "connection reset" } };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(true);
  });

  it("treats a null count as zero rather than throwing", async () => {
    result = { count: null, error: null };
    expect(await unverifiedRecipientAllowed({ to: "a@x.com", template: "t", db: db() })).toBe(true);
  });
});
