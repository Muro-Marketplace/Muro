// E30a / G4: this route recomputes every cached artist stat, rewriting
// public-facing numbers on demand, and left no audit trail. It now goes through
// `withAdmin`, which owns both the admin check and the audit write.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, refreshMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  refreshMock: vi.fn(),
}));

// The real `withAdmin` and `getAdminUser` run here, against a mocked Supabase,
// so the test exercises the actual predicate rather than a stand-in for it.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));
vi.mock("@/lib/stats-cache", () => ({ refreshArtistStatsCaches: refreshMock }));

import { POST } from "./route";

function req(token: string | null = "Bearer test-token"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/refresh-stats", { method: "POST", headers });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  refreshMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  });
  refreshMock.mockResolvedValue({ updated: 3, errors: [] });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
});

describe("POST /api/admin/refresh-stats", () => {
  it("returns 200 and refreshes for an admin", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("writes an audit row saying what it rewrote (E30a)", async () => {
    await POST(req());

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "artist_stats_refreshed",
      context: { updated: 3, errorCount: 0 },
    });
  });

  it("returns 403 for a non-admin, and never touches the caches", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "user@example.com", user_metadata: {} } },
      error: null,
    });

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Admin access required");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
