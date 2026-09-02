import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getProfileMock, resolveSubscriptionMock, rpcMock, rows } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  resolveSubscriptionMock: vi.fn(),
  rpcMock: vi.fn(),
  rows: [] as Array<{ id: string; artist_id: string; featured_until: string | null }>,
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({ getArtistProfileByUserId: getProfileMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: resolveSubscriptionMock }));
// feature_artist_work() (migration 134) does the read-check-write atomically
// under an advisory lock, so the route now makes one RPC call rather than a
// select then an update. This mock simulates that function against the
// in-memory `rows` array: find a live boost first (another of the artist's
// works with featured_until later than p_now), else update the matching
// (id, artist_id) row, else not_found. Same three outcomes the real function
// returns, same "exactly one row back" shape.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ rpc: rpcMock }),
}));

import { POST } from "./route";

const NOW = new Date("2026-09-02T12:00:00Z");

function call(id: string) {
  return POST(new Request(`http://localhost/api/artist-works/${id}/feature`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  rows.length = 0;
  rows.push(
    { id: "w1", artist_id: "ap1", featured_until: null },
    { id: "w2", artist_id: "ap1", featured_until: null },
    { id: "w9", artist_id: "ap9", featured_until: null },
  );
  authMock.mockResolvedValue({ user: { id: "u1" } });
  getProfileMock.mockResolvedValue({ profile: { id: "ap1", subscription_plan: "premium" }, works: [] });
  resolveSubscriptionMock.mockResolvedValue({ active: true, plan: "premium", user_type: "artist" });

  rpcMock.mockReset();
  rpcMock.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== "feature_artist_work") return { data: null, error: { message: `unexpected rpc ${fn}` } };
    const { p_artist_id, p_work_id, p_now, p_until } = args as {
      p_artist_id: string;
      p_work_id: string;
      p_now: string;
      p_until: string;
    };
    const live = rows.find(
      (r) => r.artist_id === p_artist_id && r.id !== p_work_id && r.featured_until && r.featured_until > p_now,
    );
    if (live) {
      return {
        data: [{ outcome: "boost_live", live_work_id: live.id, live_until: live.featured_until }],
        error: null,
      };
    }
    const row = rows.find((r) => r.id === p_work_id && r.artist_id === p_artist_id);
    if (!row) {
      return { data: [{ outcome: "not_found", live_work_id: null, live_until: null }], error: null };
    }
    row.featured_until = p_until;
    return { data: [{ outcome: "featured", live_work_id: null, live_until: null }], error: null };
  });
});

describe("POST /api/artist-works/[id]/feature", () => {
  it("boosts the caller's own work for seven days", async () => {
    const res = await call("w1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.featuredUntil).toBe("2026-09-09T12:00:00.000Z");
    expect(rows[0].featured_until).toBe("2026-09-09T12:00:00.000Z");
  });

  it("refuses Core, and any inactive subscription", async () => {
    resolveSubscriptionMock.mockResolvedValueOnce({ active: true, plan: "core", user_type: "artist" });
    expect((await call("w1")).status).toBe(403);
    resolveSubscriptionMock.mockResolvedValueOnce({ active: false, plan: "pro", user_type: "artist" });
    expect((await call("w1")).status).toBe(403);
  });

  it("allows one live boost per artist", async () => {
    rows[1].featured_until = "2026-09-05T12:00:00.000Z";
    const res = await call("w1");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "boost_live",
      workId: "w2",
      featuredUntil: "2026-09-05T12:00:00.000Z",
    });
  });

  it("lets an expired boost be replaced", async () => {
    rows[1].featured_until = "2026-09-01T12:00:00.000Z";
    expect((await call("w1")).status).toBe(200);
  });

  it("404s on someone else's work", async () => {
    expect((await call("w9")).status).toBe(404);
  });

  it("calls feature_artist_work with the artist id, work id and a seven-day boost window", async () => {
    await call("w1");
    expect(rpcMock).toHaveBeenCalledWith("feature_artist_work", {
      p_artist_id: "ap1",
      p_work_id: "w1",
      p_now: NOW.toISOString(),
      p_until: "2026-09-09T12:00:00.000Z",
    });
  });
});
