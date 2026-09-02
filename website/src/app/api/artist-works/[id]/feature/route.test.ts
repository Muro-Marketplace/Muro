import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getProfileMock, resolveSubscriptionMock, rows } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  resolveSubscriptionMock: vi.fn(),
  rows: [] as Array<{ id: string; artist_id: string; featured_until: string | null }>,
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({ getArtistProfileByUserId: getProfileMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: resolveSubscriptionMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters[col] = val; return q; },
        update: (patch: Record<string, unknown>) => {
          const upd = {
            eq: (col: string, val: unknown) => { filters[col] = val; return upd; },
            select: () => upd,
            maybeSingle: async () => {
              const row = rows.find((r) => r.id === filters.id && r.artist_id === filters.artist_id);
              if (!row) return { data: null, error: null };
              Object.assign(row, patch);
              return { data: row, error: null };
            },
          };
          return upd;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: rows.filter((r) => r.artist_id === filters.artist_id),
            error: null,
          }).then(resolve),
      };
      return q;
    },
  }),
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
    expect(await res.json()).toMatchObject({ code: "boost_live", workId: "w2" });
  });

  it("lets an expired boost be replaced", async () => {
    rows[1].featured_until = "2026-09-01T12:00:00.000Z";
    expect((await call("w1")).status).toBe(200);
  });

  it("404s on someone else's work", async () => {
    expect((await call("w9")).status).toBe(404);
  });
});
