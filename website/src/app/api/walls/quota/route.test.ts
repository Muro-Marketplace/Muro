// Quota route, covers the auth-optional behaviour (guest path returns
// guest tier, missing flag returns 404, hint params are passed through).
//
// We mock the quota service directly rather than the DB; the quota service
// has its own unit tests in src/lib/visualizer/quota.test.ts.

import { describe, expect, it, vi, beforeEach } from "vitest";

const getQuotaStatusMock = vi.fn();

vi.mock("@/lib/visualizer/quota", () => ({
  getQuotaStatus: (...args: unknown[]) => getQuotaStatusMock(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer valid") return { user: { id: "u-real" }, error: null };
    return {
      user: null,
      error: new Response(null, { status: 401 }),
    };
  }),
}));

beforeEach(() => {
  getQuotaStatusMock.mockReset();
  getQuotaStatusMock.mockResolvedValue({
    tier: "guest",
    limits: {
      daily: 0,
      monthly: 0,
      wall_uploads_daily: 0,
      saved_walls: 0,
      saved_layouts_per_wall: 0,
      can_publish_showroom: false,
    },
    daily_used: 0,
    monthly_used: 0,
    daily_remaining: 0,
    monthly_remaining: 0,
    daily_resets_at: "2026-04-26T00:00:00.000Z",
    monthly_resets_at: "2026-05-01T00:00:00.000Z",
    override_active: false,
  });

  // Force the flag on for tests, regardless of NODE_ENV.
  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
});

describe("GET /api/walls/quota", () => {
  it("returns 404 when the feature flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    const { GET } = await import("./route");
    const res = await GET(new Request("https://w.local/api/walls/quota"));
    expect(res.status).toBe(404);
  });

  it("returns guest status for an unauthenticated request", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("https://w.local/api/walls/quota"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("guest");
    expect(getQuotaStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, ownerTypeHint: undefined }),
    );
  });

  it("forwards the ?as= hint to the quota service", async () => {
    const { GET } = await import("./route");
    await GET(new Request("https://w.local/api/walls/quota?as=venue"));
    expect(getQuotaStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerTypeHint: "venue" }),
    );
  });

  it("ignores invalid ?as= values", async () => {
    const { GET } = await import("./route");
    await GET(new Request("https://w.local/api/walls/quota?as=bogus"));
    expect(getQuotaStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerTypeHint: undefined }),
    );
  });

  it("uses the authenticated userId when a Bearer token is supplied", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request("https://w.local/api/walls/quota", {
        headers: { authorization: "Bearer valid" },
      }),
    );
    expect(getQuotaStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-real" }),
    );
  });

  it("falls back to guest when the bearer token is invalid", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request("https://w.local/api/walls/quota", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(getQuotaStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });
});
