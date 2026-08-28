// E30a / G2 — this moves curation_requests through a lifecycle that includes
// `paid`, `refunded` and `cancelled`, plus free-text admin_notes, and left no
// trail at all. Money-adjacent state changed by an admin, with nothing recorded.
//
// The real `withAdmin` and `getAdminUser` run here against a mocked Supabase, so
// these exercise the actual predicate rather than a stand-in for it.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

import { PATCH } from "./route";

// A variant-valid v4 UUID: zod's .uuid() checks the version and variant
// nibbles, so a "shaped like a UUID" string is rejected at the schema.
const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

function patch(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/curation", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  updateMock.mockReturnValue({ error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    }
    return {
      update: (payload: Record<string, unknown>) => ({
        eq: async () => updateMock(payload),
      }),
    };
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
});

describe("PATCH /api/admin/curation writes an audit row (E30a)", () => {
  it("records the status change with the target id", async () => {
    const res = await PATCH(patch({ id: REQUEST_ID, status: "refunded" }));

    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "curation_request_updated",
      context: { curationRequestId: REQUEST_ID, status: "refunded", adminNotesChanged: false },
    });
  });

  it("records that notes changed without recording what they say", async () => {
    // context is JSONB and would otherwise accumulate free text an admin typed
    // about a named customer.
    await PATCH(patch({ id: REQUEST_ID, adminNotes: "Spoke to the owner, refund agreed" }));

    const { context } = recordMock.mock.calls[0][0];
    expect(context).toEqual({
      curationRequestId: REQUEST_ID,
      status: null,
      adminNotesChanged: true,
    });
    expect(JSON.stringify(context)).not.toContain("refund agreed");
  });

  it("records nothing when the payload is rejected", async () => {
    const res = await PATCH(patch({ id: "not-a-uuid", status: "paid" }));

    expect(res.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("records nothing when the update fails", async () => {
    updateMock.mockReturnValue({ error: { message: "permission denied" } });

    const res = await PATCH(patch({ id: REQUEST_ID, status: "paid" }));

    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });

    const res = await PATCH(patch({ id: REQUEST_ID, status: "paid" }));

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await PATCH(patch({ id: REQUEST_ID, status: "paid" }, null));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
