import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return { getUser: vi.fn(), fromMock, recordMock: vi.fn() };
});

vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));

import { NextResponse } from "next/server";
import { getAdminUser, isAdminRequest, withAdmin } from "./admin-auth";

// Default: user is NOT in admin_users table
function mockAdminUsersEmpty() {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        limit: async () => ({ data: [] }),
      }),
    }),
  });
}

// User IS in admin_users table
function mockAdminUsersHit() {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        limit: async () => ({ data: [{ id: "row1" }] }),
      }),
    }),
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  mockAdminUsersEmpty();
  process.env.ADMIN_EMAILS = "boss@example.com";
});

function req(token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/x", { headers });
}

describe("getAdminUser()", () => {
  it("returns the user when email + role both match", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u", email: "boss@example.com", user_metadata: { user_type: "admin" } } },
      error: null,
    });
    const result = await getAdminUser(req());
    expect(result.user?.id).toBe("u");
    expect(result.error).toBeNull();
  });

  it("403s when email is allowlisted but user_metadata.user_type !== 'admin'", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: "u", email: "boss@example.com", user_metadata: { user_type: "artist" } },
      },
      error: null,
    });
    const result = await getAdminUser(req());
    expect(result.user).toBeNull();
    expect(result.error?.status).toBe(403);
  });

  it("403s when user_metadata.user_type is missing entirely", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u", email: "boss@example.com", user_metadata: {} } },
      error: null,
    });
    const result = await getAdminUser(req());
    expect(result.error?.status).toBe(403);
  });

  it("503s when ADMIN_EMAILS is unset", async () => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAIL;
    getUser.mockResolvedValue({
      data: { user: { id: "u", email: "boss@example.com" } },
      error: null,
    });
    const result = await getAdminUser(req());
    expect(result.error?.status).toBe(503);
  });
});

describe("isAdminRequest()", () => {
  it("returns false for valid user with user_type artist and email not allowlisted", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u2", email: "artist@example.com", user_metadata: { user_type: "artist" } } },
      error: null,
    });
    expect(await isAdminRequest(req())).toBe(false);
  });

  it("returns false when email is allowlisted but user_metadata lacks user_type admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u3", email: "boss@example.com", user_metadata: { user_type: "artist" } } },
      error: null,
    });
    expect(await isAdminRequest(req())).toBe(false);
  });

  it("returns true for allowlisted email with user_type admin, without querying admin_users", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u4", email: "boss@example.com", user_metadata: { user_type: "admin" } } },
      error: null,
    });
    const result = await isAdminRequest(req());
    expect(result).toBe(true);
    // Email short-circuits: DB should not have been queried
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns true for admin_users table hit with user_type admin but email not allowlisted", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u5", email: "other@example.com", user_metadata: { user_type: "admin" } } },
      error: null,
    });
    mockAdminUsersHit();
    expect(await isAdminRequest(req())).toBe(true);
  });

  it("returns false when admin_users row exists but user_metadata lacks user_type admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u6", email: "other@example.com", user_metadata: { user_type: "artist" } } },
      error: null,
    });
    mockAdminUsersHit();
    expect(await isAdminRequest(req())).toBe(false);
  });

  it("returns false for missing token", async () => {
    expect(await isAdminRequest(req(null))).toBe(false);
  });

  it("returns false for invalid token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid"),
    });
    expect(await isAdminRequest(req("Bearer bad"))).toBe(false);
  });
});


// E30a — nothing enforced the pairing of "check admin" with "write an audit
// row", so coverage tracked whichever phase of work last touched a file. The
// admission gate, the curation lifecycle (which includes `paid` and `refunded`)
// and admin-approved Stripe refunds all mutated state with no trail at all.
describe("withAdmin (E30a)", () => {
  const ADMIN_USER = {
    id: "u-admin",
    email: "boss@example.com",
    user_metadata: { user_type: "admin" },
  };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: ADMIN_USER }, error: null });
  });

  it("writes the row the handler asked for, before returning", async () => {
    const res = await withAdmin(req(), "thing_done", async ({ audit }) => {
      audit({ targetId: "t1" });
      return NextResponse.json({ success: true });
    });

    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "thing_done",
      context: { targetId: "t1" },
    });
  });

  it("lets the handler refine the action name", async () => {
    // One route, two decisions: the audit log has to stay queryable by action.
    await withAdmin(req(), "application_decision", async ({ audit }) => {
      audit({ decision: "rejected" }, "application_rejected");
      return NextResponse.json({ success: true });
    });

    expect(recordMock.mock.calls[0][0].action).toBe("application_rejected");
  });

  it("still writes a row when a successful handler forgot to call audit", async () => {
    // THE point of the wrapper. Forgetting is what caused the gap; a successful
    // mutation must never be invisible.
    await withAdmin(req(), "thing_done", async () => NextResponse.json({ success: true }));

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toMatchObject({
      action: "thing_done",
      context: undefined,
    });
  });

  it("writes nothing when the handler refused the request", async () => {
    // A 4xx changed nothing, so there is nothing to account for.
    const res = await withAdmin(req(), "thing_done", async () =>
      NextResponse.json({ error: "nope" }, { status: 400 }),
    );

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("writes a row for a failed request the handler explicitly audited", async () => {
    await withAdmin(req(), "thing_attempted", async ({ audit }) => {
      audit({ reason: "downstream failure" });
      return NextResponse.json({ error: "failed" }, { status: 500 });
    });

    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("never runs the handler for a non-admin, and audits nothing", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u-x", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const handler = vi.fn();

    const res = await withAdmin(req(), "thing_done", handler);

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never runs the handler without a token", async () => {
    const handler = vi.fn();
    const res = await withAdmin(req(null), "thing_done", handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
