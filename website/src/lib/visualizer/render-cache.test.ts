// Render cache, small surface, easy to cover.
//   - returns null on miss
//   - returns the row on hit
//   - filters by user, hash, AND kind (HD doesn't reuse Standard)
//   - respects TTL cutoff

import { describe, expect, it } from "vitest";
import { findCachedRender } from "./render-cache";
import { buildMockSupabase } from "./test-helpers";

const NOW = new Date("2026-04-25T12:00:00Z");

describe("findCachedRender", () => {
  it("returns null when no row matches", async () => {
    const db = buildMockSupabase({
      tables: {
        wall_renders: {
          maybeSingle: () => ({ data: null, error: null }),
        },
      },
    });
    const result = await findCachedRender(
      { userId: "u1", layoutHash: "abc", kind: "standard", now: NOW },
      db,
    );
    expect(result).toBeNull();
  });

  it("returns the row on hit", async () => {
    const db = buildMockSupabase({
      tables: {
        wall_renders: {
          maybeSingle: () => ({
            data: {
              id: "r1",
              layout_id: "lay-1",
              user_id: "u1",
              kind: "standard",
              output_path: "u1/r1.webp",
              layout_hash: "abc",
              cost_units: 1,
              kept: false,
              provider: null,
              prompt_seed: null,
              created_at: "2026-04-25T11:00:00Z",
            },
            error: null,
          }),
        },
      },
    });
    const result = await findCachedRender(
      { userId: "u1", layoutHash: "abc", kind: "standard", now: NOW },
      db,
    );
    expect(result?.id).toBe("r1");
    expect(result?.output_path).toBe("u1/r1.webp");
  });

  it("returns null when DB errors", async () => {
    const db = buildMockSupabase({
      tables: {
        wall_renders: {
          maybeSingle: () => ({ data: null, error: { message: "boom" } }),
        },
      },
    });
    const result = await findCachedRender(
      { userId: "u1", layoutHash: "abc", kind: "standard", now: NOW },
      db,
    );
    expect(result).toBeNull();
  });
});
