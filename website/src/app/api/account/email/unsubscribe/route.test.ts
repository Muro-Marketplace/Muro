// C27. /api/account/email/unsubscribe is deliberately unauthenticated (the
// link in the email is the bearer), but it took the `u` parameter straight
// from the query string and upserted it into email_preferences. That table's
// user_id is a bare `uuid PRIMARY KEY` with no REFERENCES auth.users
// (migration 016), so any UUID at all created a permanent orphan row, and
// nothing rate limited the endpoint, so the row count was unbounded.
//
// The fix: reject anything that is not a UUID, confirm the user actually
// exists before writing, and rate limit both verbs. The response text is
// unchanged in every branch so the endpoint still cannot be used to test
// whether an account exists.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { upsertMock, fromMock, getUserByIdMock, withRateLimitMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  withRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (...a: unknown[]) => withRateLimitMock(...a),
}));

import { GET, POST } from "./route";
import { signUnsubscribe } from "@/lib/unsubscribe-token";

const REAL_USER = "11111111-2222-4333-8444-555555555555";

function req(query: string): Request {
  return new Request(`https://wallplace.co.uk/api/account/email/unsubscribe${query}`, {
    method: "POST",
  });
}

beforeEach(() => {
  upsertMock.mockReset();
  fromMock.mockReset();
  getUserByIdMock.mockReset();
  withRateLimitMock.mockReset();

  upsertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ upsert: upsertMock });
  getUserByIdMock.mockResolvedValue({ data: { user: { id: REAL_USER } }, error: null });
  withRateLimitMock.mockResolvedValue(null);
});

describe("POST /api/account/email/unsubscribe writes only for real users (C27)", () => {
  it("unsubscribes a real user", async () => {
    const res = await POST(req(`?u=${REAL_USER}&c=digests`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message: "You've been unsubscribed from this category.",
    });
    expect(getUserByIdMock).toHaveBeenCalledWith(REAL_USER);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      user_id: REAL_USER,
      digests_enabled: false,
    });
  });

  it("writes nothing for a user id that does not exist, and says the same thing", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });

    const real = await POST(req(`?u=${REAL_USER}&c=digests`));
    const realBody = await real.text();
    upsertMock.mockClear();

    const ghost = await POST(req("?u=99999999-8888-4777-8666-555555555555&c=digests"));

    // Fail-before: this inserted an orphan email_preferences row keyed on a
    // UUID with no account behind it.
    expect(upsertMock).not.toHaveBeenCalled();
    // Still not an account-existence oracle: identical status and bytes.
    expect(ghost.status).toBe(real.status);
    expect(await ghost.text()).toBe(realBody);
  });

  it("rejects a malformed user id without touching the database", async () => {
    const res = await POST(req("?u=not-a-uuid&c=digests"));

    expect(res.status).toBe(400);
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("treats a failed existence lookup as no write", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: { message: "boom" } });

    await POST(req(`?u=${REAL_USER}&c=digests`));

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still short-circuits a critical category before any lookup", async () => {
    const res = await POST(req(`?u=${REAL_USER}&c=security`));

    expect(res.status).toBe(200);
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("unsubscribe endpoint is rate limited (C27)", () => {
  it("returns the limiter's 429 from POST and writes nothing", async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 }),
    );

    const res = await POST(req(`?u=${REAL_USER}&c=digests`));

    // Fail-before: neither entry point applied any rate limiting, so junk
    // rows were unbounded.
    expect(res.status).toBe(429);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns the limiter's 429 from GET and writes nothing", async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 }),
    );

    const res = await GET(
      new Request(`https://wallplace.co.uk/api/account/email/unsubscribe?u=${REAL_USER}&c=digests`),
    );

    expect(res.status).toBe(429);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("passes a named rule to the limiter", async () => {
    await POST(req(`?u=${REAL_USER}&c=digests`));

    expect(withRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "email_unsubscribe" }),
    );
  });
});

describe("GET /api/account/email/unsubscribe keeps the same guards (C27)", () => {
  it("writes nothing for a user id that does not exist", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new Request(`https://wallplace.co.uk/api/account/email/unsubscribe?u=${REAL_USER}&c=tips`),
    );

    expect(res.status).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// A1.3. The route's header describes the trust model as "the link is the
// bearer". It was not: the link carried the recipient's raw user id and
// nothing else, so the bearer was really the id, and a GET is something any
// crawler can issue. Corporate mail-security scanners and link prefetchers
// fetch every URL in an email without a human seeing it, and each of those
// silently unsubscribed the recipient. Verified against production on
// 2026-08-30: an unauthenticated GET carrying only a real user id turned that
// account's newsletter off.
describe("unsubscribe link signature (A1.3)", () => {
  const ORIGINAL_SECRET = process.env.ORDER_TOKEN_SECRET;

  function getReq(query: string): Request {
    return new Request(`https://wallplace.co.uk/api/account/email/unsubscribe${query}`, {
      method: "GET",
    });
  }

  beforeEach(() => {
    process.env.ORDER_TOKEN_SECRET = "test-secret-of-at-least-32-characters-long";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.ORDER_TOKEN_SECRET;
    else process.env.ORDER_TOKEN_SECRET = ORIGINAL_SECRET;
  });

  it("a signed GET unsubscribes, as the visible link in an email must", async () => {
    const s = signUnsubscribe(REAL_USER);
    const res = await GET(getReq(`?u=${REAL_USER}&s=${encodeURIComponent(s)}&c=digests`));

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ user_id: REAL_USER, digests_enabled: false });
  });

  it("an unsigned GET writes nothing at all", async () => {
    const res = await GET(getReq(`?u=${REAL_USER}&c=digests`));

    expect(upsertMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requiresConfirmation: true });
  });

  it("a GET signed for someone else writes nothing", async () => {
    const other = "99999999-2222-4333-8444-555555555555";
    const res = await GET(getReq(`?u=${REAL_USER}&s=${encodeURIComponent(signUnsubscribe(other))}&c=digests`));

    expect(upsertMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("a tampered signature writes nothing", async () => {
    const s = signUnsubscribe(REAL_USER);
    const flipped = (s[0] === "A" ? "B" : "A") + s.slice(1);
    await GET(getReq(`?u=${REAL_USER}&s=${encodeURIComponent(flipped)}&c=digests`));

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still points an unsigned visitor at a way to unsubscribe", async () => {
    // Unsubscribing is a legal obligation, so the answer must never be a dead
    // end. One deliberate click in the preference centre, not a silent write.
    const res = await GET(getReq(`?u=${REAL_USER}&c=digests`));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(String(body.message)).toMatch(/preferences/i);
  });

  it("the one-click POST still honours mail sent before signing existed", async () => {
    // RFC 8058 one-click is the recipient's own mail client acting on their
    // instruction, not a crawler, and those links are still in inboxes.
    const res = await POST(req(`?u=${REAL_USER}&c=digests`));

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("an unsigned GET gives the same answer for a real and an unknown user", async () => {
    // The endpoint must stay useless as an account-existence oracle.
    const real = await GET(getReq(`?u=${REAL_USER}&c=digests`));
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });
    const unknown = await GET(getReq("?u=44444444-2222-4333-8444-555555555555&c=digests"));

    expect(real.status).toBe(unknown.status);
    expect(await real.json()).toEqual(await unknown.json());
  });
});

// The protection above is only correct if it activates when signing is
// possible and stands down when it is not. ORDER_TOKEN_SECRET is optional in
// env.ts, so a deployment may not have it, and enforcing a signature we could
// never have produced would turn the unsubscribe link in every email into a
// dead end.
describe("unsubscribe signing stands down when it is not configured", () => {
  const ORIGINAL_SECRET = process.env.ORDER_TOKEN_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.ORDER_TOKEN_SECRET;
    else process.env.ORDER_TOKEN_SECRET = ORIGINAL_SECRET;
  });

  it("honours an unsigned GET when no secret is set", async () => {
    delete process.env.ORDER_TOKEN_SECRET;
    const res = await GET(
      new Request(`https://wallplace.co.uk/api/account/email/unsubscribe?u=${REAL_USER}&c=digests`, {
        method: "GET",
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("enforces as soon as a secret is set", async () => {
    process.env.ORDER_TOKEN_SECRET = "test-secret-of-at-least-32-characters-long";
    await GET(
      new Request(`https://wallplace.co.uk/api/account/email/unsubscribe?u=${REAL_USER}&c=digests`, {
        method: "GET",
      }),
    );

    expect(upsertMock).not.toHaveBeenCalled();
  });
});
