import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { isSubscribed } from "./subscriptions";

// Build a Supabase query chain mock that resolves to `result` when
// `maybeSingle()` is called. Returned object also exposes the inner mocks
// for fine-grained assertions if needed.
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

/**
 * Configure the fromMock to return preset chains keyed by table. Tests
 * that don't supply a key for a given table default to a "no row found"
 * chain so parallel lookups don't blow up looking for a missing mock.
 */
function setTables(
  tables: Partial<
    Record<
      "artist_profiles" | "venue_profiles",
      { data?: unknown; error?: { message: string } | null } | "missing"
    >
  >,
) {
  fromMock.mockImplementation((table: string) => {
    const entry = tables[table as keyof typeof tables];
    if (entry === undefined || entry === "missing") {
      return chain({ data: null, error: null });
    }
    return chain(entry);
  });
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("isSubscribed()", () => {
  it("returns inactive null-user when userId is empty", async () => {
    const res = await isSubscribed("");
    expect(res).toEqual({ active: false, plan: null, user_type: null });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns active artist with plan for active status", async () => {
    setTables({
      artist_profiles: {
        data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
        error: null,
      },
      venue_profiles: "missing",
    });

    const res = await isSubscribed("u-artist-1");
    expect(res).toEqual({ active: true, plan: "premium", user_type: "artist" });
  });

  it("treats 'trialing' as active", async () => {
    setTables({
      artist_profiles: {
        data: { user_id: "u1", subscription_status: "trialing", subscription_plan: "pro" },
        error: null,
      },
    });

    const res = await isSubscribed("u-artist-2");
    expect(res).toEqual({ active: true, plan: "pro", user_type: "artist" });
  });

  it("treats 'cancelled' / 'past_due' / null / 'none' status as inactive", async () => {
    for (const status of ["cancelled", "past_due", null, "none"] as (string | null)[]) {
      fromMock.mockReset();
      setTables({
        artist_profiles: {
          data: { user_id: "u1", subscription_status: status, subscription_plan: "core" },
          error: null,
        },
      });
      const res = await isSubscribed(`u-artist-${status}`);
      expect(res.active).toBe(false);
      expect(res.user_type).toBe("artist");
    }
  });

  it("normalises an unknown plan string to null", async () => {
    setTables({
      artist_profiles: {
        data: { user_id: "u1", subscription_status: "active", subscription_plan: "lifetime" },
        error: null,
      },
    });
    const res = await isSubscribed("u-artist-weird");
    expect(res.plan).toBeNull();
    expect(res.active).toBe(true);
  });

  it("falls through to venue when there is no artist profile", async () => {
    setTables({
      artist_profiles: "missing",
      venue_profiles: {
        data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
        error: null,
      },
    });
    const res = await isSubscribed("u-venue-1");
    expect(res).toEqual({ active: true, plan: "premium", user_type: "venue" });
  });

  it("returns null and warns when venue lookup errors (post mig 064 columns exist, hard fail surfaces)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setTables({
      artist_profiles: "missing",
      venue_profiles: {
        data: null,
        error: { message: "permission denied for table venue_profiles" },
      },
    });
    const res = await isSubscribed("u-venue-err");
    expect(res).toEqual({ active: false, plan: null, user_type: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats venue with default subscription_status='none' as inactive but identified", async () => {
    setTables({
      artist_profiles: "missing",
      venue_profiles: {
        data: { user_id: "u1", subscription_status: "none", subscription_plan: null },
        error: null,
      },
    });
    const res = await isSubscribed("u-venue-default");
    expect(res).toEqual({ active: false, plan: null, user_type: "venue" });
  });

  it("returns user_type=null when neither profile exists", async () => {
    setTables({ artist_profiles: "missing", venue_profiles: "missing" });
    const res = await isSubscribed("u-nobody-1");
    expect(res).toEqual({ active: false, plan: null, user_type: null });
  });

  it("prefers artist over venue when both rows exist", async () => {
    setTables({
      artist_profiles: {
        data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
        error: null,
      },
      venue_profiles: {
        data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
        error: null,
      },
    });
    const res = await isSubscribed("u-dual-1");
    expect(res.user_type).toBe("artist");
  });
});
