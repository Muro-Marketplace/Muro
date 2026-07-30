// E46b (06 B1). ToS-acceptance forgery.
//
// The route inserted `user_email` straight from the request body while
// discarding the auth error, so an unauthenticated caller could forge a row
// asserting that any email address had accepted the platform terms, stamped with
// the attacker's IP and user agent. terms_acceptances is the evidence trail for a
// contractual act, so that is both a forged acceptance against a third party and
// repudiation cover for a real one.
//
// Prod check that framed the fix: all 51 rows have user_id = NULL, i.e. every
// acceptance on record today is the unverifiable kind, because all six callers
// are pre-signup.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, insertMock, rateLimitMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  insertMock: vi.fn(async () => ({ error: null })),
  // Explicit return type: inferred from the default it would be `null` and every
  // mockResolvedValue carrying a 429 Response would fail typecheck.
  rateLimitMock: vi.fn(async (): Promise<Response | null> => null),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { POST } from "./route";

function req(body: unknown, auth = false) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = "Bearer real";
  return new Request("http://localhost/api/terms/accept", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID = {
  userEmail: "someone@example.com",
  userType: "artist",
  termsVersion: "v1.0-2026-04",
  termsType: "platform_tos",
};

/** The row handed to .insert(). */
const inserted = () =>
  (insertMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];

beforeEach(() => {
  authMock.mockReset();
  insertMock.mockClear();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(null);
  authMock.mockResolvedValue({ user: null, error: null });
});

describe("POST /api/terms/accept authenticated path (E46b)", () => {
  it("ignores a body-supplied userEmail and uses the token's email", async () => {
    // The forgery, attempted by someone who IS signed in: name the victim in the
    // body and have the row recorded against them.
    authMock.mockResolvedValue({
      user: { id: "u-real", email: "real@example.com" },
      error: null,
    });
    const res = await POST(req({ ...VALID, userEmail: "victim@example.com" }, true));
    expect(res.status).toBe(200);
    expect(inserted().user_email).toBe("real@example.com");
    expect(JSON.stringify(inserted())).not.toContain("victim@example.com");
  });

  it("binds the row to the token's user id", async () => {
    authMock.mockResolvedValue({
      user: { id: "u-real", email: "real@example.com" },
      error: null,
    });
    await POST(req(VALID, true));
    expect(inserted().user_id).toBe("u-real");
  });

  it("lower-cases the token email so the trail is comparable", async () => {
    authMock.mockResolvedValue({
      user: { id: "u-real", email: "Real@Example.COM" },
      error: null,
    });
    await POST(req(VALID, true));
    expect(inserted().user_email).toBe("real@example.com");
  });
});

describe("POST /api/terms/accept input validation (E46b)", () => {
  it("rejects an unknown userType instead of storing free text", async () => {
    const res = await POST(req({ ...VALID, userType: "administrator" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-email userEmail", async () => {
    const res = await POST(req({ ...VALID, userEmail: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("caps termsVersion, which was uncapped free text on an unbounded insert", async () => {
    const res = await POST(req({ ...VALID, termsVersion: "v".repeat(5000) }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects a missing field", async () => {
    const res = await POST(req({ userType: "artist" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body without throwing", async () => {
    const res = await POST(
      new Request("http://localhost/api/terms/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/terms/accept rate limit (E46b)", () => {
  it("is rate limited before anything else, since the insert is unbounded", async () => {
    rateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );
    const res = await POST(req(VALID));
    expect(res.status).toBe(429);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("checks the limit before parsing, so a huge body cannot be used to probe", async () => {
    rateLimitMock.mockResolvedValue(
      new Response(null, { status: 429 }),
    );
    await POST(req({ ...VALID, termsVersion: "v".repeat(100000) }));
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/terms/accept pre-signup path, documented as still forgeable", () => {
  it("still records an unauthenticated acceptance, because all six callers are pre-signup", async () => {
    // Not a bug being pinned as correct: this is the residual gap. Requiring auth
    // would break three signup pages and ApplicationForm, all of which fire
    // immediately after supabase.auth.signUp and before email confirmation.
    // Closing it properly means recording acceptance AFTER confirmation, which
    // changes when the evidence is stamped. That is an owner decision, recorded
    // in PROGRESS.md.
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(inserted().user_id).toBeNull();
    expect(inserted().user_email).toBe("someone@example.com");
  });

  it("still stamps ip and user agent, which is what makes the row evidence at all", async () => {
    await POST(req(VALID));
    expect(inserted()).toHaveProperty("ip_address");
    expect(inserted()).toHaveProperty("user_agent");
    expect(inserted().accepted_at).toBeTruthy();
  });
});
