// tier-resolver maps a Supabase user → VisualizerTier. We test:
//   - guest path (no userId)
//   - artist hint paths (core / premium / pro / no profile)
//   - venue hint paths (premium / standard / column-not-found fallback)
//   - customer hint
//   - unhinted: artist > venue > customer fall-through
//   - DB errors → safe default

import { describe, expect, it } from "vitest";
import {
  artistPlanToTier,
  resolveTier,
  venuePlanToTier,
} from "./tier-resolver";
import { buildMockSupabase } from "./test-helpers";

describe("artistPlanToTier", () => {
  it("maps recognised plans", () => {
    expect(artistPlanToTier("core")).toBe("artist_core");
    expect(artistPlanToTier("premium")).toBe("artist_premium");
    expect(artistPlanToTier("pro")).toBe("artist_pro");
  });

  it("normalises case", () => {
    expect(artistPlanToTier("Pro")).toBe("artist_pro");
    expect(artistPlanToTier("PREMIUM")).toBe("artist_premium");
  });

  it("falls back to core for unknown / null", () => {
    expect(artistPlanToTier(null)).toBe("artist_core");
    expect(artistPlanToTier("")).toBe("artist_core");
    expect(artistPlanToTier("platinum")).toBe("artist_core");
  });
});

describe("venuePlanToTier", () => {
  it("maps premium", () => {
    expect(venuePlanToTier("premium")).toBe("venue_premium");
    expect(venuePlanToTier("Premium")).toBe("venue_premium");
  });

  it("falls back to standard for null / standard / unknown", () => {
    expect(venuePlanToTier(null)).toBe("venue_standard");
    expect(venuePlanToTier("standard")).toBe("venue_standard");
    expect(venuePlanToTier("vip")).toBe("venue_standard");
  });
});

describe("resolveTier, guest", () => {
  it("returns guest when userId is null", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(await resolveTier({ userId: null }, db)).toBe("guest");
  });

  it("returns guest when userId is empty", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(await resolveTier({ userId: "  " }, db)).toBe("guest");
  });
});

describe("resolveTier, artist hint", () => {
  it("artist_pro for subscription_plan='pro'", async () => {
    const db = buildMockSupabase({
      tables: {
        artist_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "pro", free_until: null },
            error: null,
          }),
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "artist" }, db),
    ).toBe("artist_pro");
  });

  it("artist_premium for premium plan", async () => {
    const db = buildMockSupabase({
      tables: {
        artist_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "premium", free_until: null },
            error: null,
          }),
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "artist" }, db),
    ).toBe("artist_premium");
  });

  it("artist_core for unknown / empty plan", async () => {
    const db = buildMockSupabase({
      tables: {
        artist_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: null, free_until: null },
            error: null,
          }),
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "artist" }, db),
    ).toBe("artist_core");
  });

  it("artist_core when user has no artist profile (defensive)", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "artist" }, db),
    ).toBe("artist_core");
  });

  it("falls back when artist_profiles query errors", async () => {
    const db = buildMockSupabase({
      tables: {
        artist_profiles: {
          maybeSingle: () => ({ data: null, error: { message: "boom" } }),
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "artist" }, db),
    ).toBe("artist_core");
  });
});

describe("resolveTier, venue hint", () => {
  it("venue_premium for premium plan", async () => {
    const db = buildMockSupabase({
      tables: {
        venue_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "premium" },
            error: null,
          }),
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "venue" }, db),
    ).toBe("venue_premium");
  });

  it("venue_standard when subscription_plan column is missing entirely", async () => {
    // The venue subscription column doesn't exist yet in production, the
    // resolver must tolerate it and fall back to standard.
    let callCount = 0;
    const db = buildMockSupabase({
      tables: {
        venue_profiles: {
          maybeSingle: () => {
            callCount++;
            if (callCount === 1) {
              return {
                data: null,
                error: {
                  message:
                    'column venue_profiles.subscription_plan does not exist',
                },
              };
            }
            // Fallback bare lookup, the venue exists.
            return { data: { user_id: "u1" }, error: null };
          },
        },
      },
    });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "venue" }, db),
    ).toBe("venue_standard");
  });

  it("venue_standard when no venue profile exists", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "venue" }, db),
    ).toBe("venue_standard");
  });
});

describe("resolveTier, customer hint", () => {
  it("returns customer immediately, no DB lookup", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(
      await resolveTier({ userId: "u1", ownerTypeHint: "customer" }, db),
    ).toBe("customer");
  });
});

describe("resolveTier, unhinted fall-through", () => {
  it("artist takes priority over venue", async () => {
    const db = buildMockSupabase({
      tables: {
        artist_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "premium", free_until: null },
            error: null,
          }),
        },
        venue_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "premium" },
            error: null,
          }),
        },
      },
    });
    expect(await resolveTier({ userId: "u1" }, db)).toBe("artist_premium");
  });

  it("venue when no artist profile", async () => {
    const db = buildMockSupabase({
      tables: {
        venue_profiles: {
          maybeSingle: () => ({
            data: { user_id: "u1", subscription_plan: "premium" },
            error: null,
          }),
        },
      },
    });
    expect(await resolveTier({ userId: "u1" }, db)).toBe("venue_premium");
  });

  it("customer when no profile of either kind", async () => {
    const db = buildMockSupabase({ tables: {} });
    expect(await resolveTier({ userId: "u1" }, db)).toBe("customer");
  });
});
