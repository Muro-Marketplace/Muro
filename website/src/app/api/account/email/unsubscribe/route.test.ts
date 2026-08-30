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

import { describe, it, expect, vi, beforeEach } from "vitest";

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
