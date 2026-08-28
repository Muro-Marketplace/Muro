// E30b — the server half of the admin gate.
//
// `AdminGate` renders the admin shell only when this route says ok, so it must
// answer with the real predicate and never on `user_metadata` alone. The
// mock harness mirrors `src/lib/admin-auth.test.ts` so both exercise the same
// real `getAdminUser`, rather than mocking the thing under test.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));

import { GET } from "./route";

function adminUsersRows(rows: unknown[]) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ limit: async () => ({ data: rows, error: null }) }) }),
  });
}

function req(token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/whoami", { headers });
}

function user(over: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: "user-1",
        email: "boss@example.com",
        user_metadata: { user_type: "admin" },
        ...over,
      },
    },
    error: null,
  };
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  adminUsersRows([]);
  process.env.ADMIN_EMAILS = "boss@example.com";
});

describe("GET /api/admin/whoami", () => {
  it("answers ok for a real admin", async () => {
    getUser.mockResolvedValue(user());
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "boss@example.com" });
  });

  it("refuses a self-declared admin whose email is not allowlisted", async () => {
    // THE regression case: metadata is what the old client gate trusted, and it
    // is exactly what an attacker sets on themselves at signup.
    getUser.mockResolvedValue(
      user({ id: "attacker-1", email: "attacker@evil.example" }),
    );

    const res = await GET(req());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required" });
  });

  it("recognises an admin held only by an admin_users row", async () => {
    adminUsersRows([{ user_id: "user-2" }]);
    getUser.mockResolvedValue(user({ id: "user-2", email: "second@example.com" }));

    const res = await GET(req());
    expect(res.status).toBe(200);
  });

  it("answers 401 with no token", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("answers 401 for an invalid token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("answers 503 when no admin allowlist is configured", async () => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAIL;
    getUser.mockResolvedValue(user());

    const res = await GET(req());
    expect(res.status).toBe(503);

    process.env.ADMIN_EMAILS = "boss@example.com";
  });

  it("discloses nothing beyond the caller's own email", async () => {
    getUser.mockResolvedValue(user());
    const body = await (await GET(req())).json();
    expect(Object.keys(body).sort()).toEqual(["email", "ok"]);
  });
});
