import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { isSubscribed } from "./subscriptions";

// Build a Supabase query chain mock that resolves to `result` when
// `maybeSingle()` is called. Records the table name so tests can assert on it.
function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("isSubscribed()", () => {
  it("returns inactive customer when userId is empty", async () => {
    const res = await isSubscribed("");
    expect(res).toEqual({ active: false, plan: null, user_type: null });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns active artist with plan for active status", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chain({
          data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
          error: null,
        });
      }
      throw new Error("unexpected table " + table);
    });

    const res = await isSubscribed("u-artist-1");
    expect(res).toEqual({ active: true, plan: "premium", user_type: "artist" });
  });

  it("treats 'trialing' as active", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chain({
          data: { user_id: "u1", subscription_status: "trialing", subscription_plan: "pro" },
          error: null,
        });
      }
      throw new Error(table);
    });

    const res = await isSubscribed("u-artist-2");
    expect(res).toEqual({ active: true, plan: "pro", user_type: "artist" });
  });

  it("treats 'cancelled' / 'past_due' / NULL status as inactive", async () => {
    for (const status of ["cancelled", "past_due", null, "none"]) {
      fromMock.mockReset();
      fromMock.mockImplementation((table: string) => {
        if (table === "artist_profiles") {
          return chain({
            data: { user_id: "u1", subscription_status: status, subscription_plan: "core" },
            error: null,
          });
        }
        throw new Error(table);
      });
      const res = await isSubscribed(`u-artist-${status}`);
      expect(res.active).toBe(false);
      expect(res.user_type).toBe("artist");
    }
  });

  it("normalises an unknown plan string to null", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chain({
          data: { user_id: "u1", subscription_status: "active", subscription_plan: "lifetime" },
          error: null,
        });
      }
      throw new Error(table);
    });
    const res = await isSubscribed("u-artist-weird");
    expect(res.plan).toBeNull();
    expect(res.active).toBe(true);
  });

  it("falls through to venue when there is no artist profile", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chain({ data: null, error: null });
      }
      if (table === "venue_profiles") {
        return chain({
          data: { user_id: "u1", subscription_status: "active", subscription_plan: "premium" },
          error: null,
        });
      }
      throw new Error(table);
    });
    const res = await isSubscribed("u-venue-1");
    expect(res).toEqual({ active: true, plan: "premium", user_type: "venue" });
  });

  it("tolerates missing venue subscription columns and reports user_type='venue'", async () => {
    let venueCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chain({ data: null, error: null });
      }
      if (table === "venue_profiles") {
        venueCall += 1;
        if (venueCall === 1) {
          // First lookup: subscription columns don't exist yet.
          return chain({
            data: null,
            error: { message: "column venue_profiles.subscription_status does not exist" },
          });
        }
        // Bare lookup, just confirms the venue row exists.
        return chain({ data: { user_id: "u1" }, error: null });
      }
      throw new Error(table);
    });
    const res = await isSubscribed("u-venue-legacy");
    expect(res).toEqual({ active: false, plan: null, user_type: "venue" });
    expect(venueCall).toBe(2);
  });

  it("returns customer when neither profile exists", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles" || table === "venue_profiles") {
        return chain({ data: null, error: null });
      }
      throw new Error(table);
    });
    const res = await isSubscribed("u-customer-1");
    expect(res).toEqual({ active: false, plan: null, user_type: "customer" });
  });
});
