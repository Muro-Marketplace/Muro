// /api/account/delete — POST GDPR hard-delete.
//
// Coverage focuses on the boundaries:
//   - unauth → 401 (delegated to auth helper)
//   - missing or wrong confirm string → 400
//   - happy path: every TABLES_USER_ID row gets a delete().eq(), then
//     auth.admin.deleteUser fires with the authenticated user's id
//   - delete().eq() that returns an error logs but does NOT abort
//   - auth.admin.deleteUser failure → 500
//   - userId comes from auth.user.id, never the body (security)

import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDeleteUser = vi.fn();
const fromMock = vi.fn();
const eqMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
    from: fromMock,
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer valid") return { user: { id: "u1", email: "a@x.com" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  mockDeleteUser.mockReset();
  fromMock.mockReset();
  eqMock.mockReset();
  deleteMock.mockReset();

  // default happy-path wiring: every from(...).delete().eq(...) resolves clean.
  eqMock.mockResolvedValue({ error: null });
  deleteMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ delete: deleteMock });
  mockDeleteUser.mockResolvedValue({ data: null, error: null });
});

function req(token = "Bearer valid", body: unknown = { confirm: "DELETE MY ACCOUNT" }): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/delete", () => {
  it("requires authentication", async () => {
    const res = await POST(req(""));
    expect(res.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation string", async () => {
    const res = await POST(req("Bearer valid", { confirm: "no" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/confirm/i);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when body is empty / no confirm field", async () => {
    const res = await POST(req("Bearer valid", {}));
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when JSON body is malformed", async () => {
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when JSON body is literal null (not 500)", async () => {
    // request.json() returns null (not an exception) for body "null", which
    // would crash on body.confirm if not guarded. Must return 400, not 500.
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "null",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes every user-owned table row, then the auth user", async () => {
    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1");
    expect(fromMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
    // Every cleanup call should target the authenticated user's id, never
    // a value from the request body.
    for (const call of eqMock.mock.calls) {
      expect(call[1]).toBe("u1");
    }
  });

  it("touches expected core tables (smoke)", async () => {
    await POST(req("Bearer valid"));
    const tablesTouched = fromMock.mock.calls.map((c) => c[0]);
    // Spot-check: the plan's required tables show up.
    expect(tablesTouched).toEqual(expect.arrayContaining([
      "saved_items",
      "notifications",
      "messages",
      "placements",
      "orders",
      "refund_requests",
      "artist_profiles",
      "venue_profiles",
      "customer_profiles",
    ]));
  });

  it("logs but does not abort when a child cleanup fails", async () => {
    // First delete().eq() returns an error; subsequent ones succeed.
    eqMock
      .mockResolvedValueOnce({ error: { message: "boom" } })
      .mockResolvedValue({ error: null });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns 500 when auth.admin.deleteUser fails", async () => {
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: "auth boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/contact support|could not/i);
    errSpy.mockRestore();
  });

  it("ignores any user_id passed in the body (security)", async () => {
    // Even if the caller smuggles a different user_id in the body,
    // the route MUST use auth.user.id from the verified token.
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE MY ACCOUNT", user_id: "u-other", target: "u-other" }),
    });
    const res = await POST(r);
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1"); // the *authenticated* user, not the body
    expect(mockDeleteUser).not.toHaveBeenCalledWith("u-other");
  });
});
