// G-C / Bug 10. The route test covers the refusal; this covers the resolver's
// fail-closed rules, which the route test can't reach cleanly (DB errors, blank
// slugs, slug case).
//
// The whole point of this module is that "we could not confirm the artist ships
// abroad" and "the artist ships abroad" are different answers. Every ambiguous
// case must resolve to UK only, because the cost of being wrong that way is a
// refused order, and the cost of being wrong the other way is a delivery promise
// the artist never made.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { findUkOnlyArtists } from "./shipping-scope";

/** Mock artist_profiles with an explicit row set. */
function mockRows(
  rows: Array<{ slug: string | null; ships_internationally: boolean | null }>,
  error: { message: string } | null = null,
) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      in: async (_col: string, slugs: string[]) => ({
        data: error ? null : rows.filter((r) => slugs.includes((r.slug || "").toLowerCase())),
        error,
      }),
    }),
  }));
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("findUkOnlyArtists", () => {
  it("returns nothing when every artist ships abroad", async () => {
    mockRows([
      { slug: "alice", ships_internationally: true },
      { slug: "bob", ships_internationally: true },
    ]);
    expect(await findUkOnlyArtists(["alice", "bob"])).toEqual([]);
  });

  it("returns the artists who do not", async () => {
    mockRows([
      { slug: "alice", ships_internationally: true },
      { slug: "bob", ships_internationally: false },
    ]);
    expect(await findUkOnlyArtists(["alice", "bob"])).toEqual(["bob"]);
  });

  it("treats a NULL flag as UK only", async () => {
    // Can't happen through migration 081 (NOT NULL DEFAULT false), but a resolver
    // that trusted a null here would ship abroad on a schema change.
    mockRows([{ slug: "alice", ships_internationally: null }]);
    expect(await findUkOnlyArtists(["alice"])).toEqual(["alice"]);
  });

  it("treats a missing profile row as UK only", async () => {
    mockRows([]);
    expect(await findUkOnlyArtists(["ghost"])).toEqual(["ghost"]);
  });

  it("treats a read failure as UK only, for every slug", async () => {
    mockRows([], { message: "connection reset" });
    expect(await findUkOnlyArtists(["alice", "bob"])).toEqual(["alice", "bob"]);
  });

  it("treats a blank slug as UK only without querying for it", async () => {
    let queried: string[] = [];
    fromMock.mockImplementation(() => ({
      select: () => ({
        in: async (_col: string, slugs: string[]) => {
          queried = slugs;
          return { data: [{ slug: "alice", ships_internationally: true }], error: null };
        },
      }),
    }));
    expect(await findUkOnlyArtists(["alice", ""])).toEqual([""]);
    expect(queried).toEqual(["alice"]);
  });

  it("skips the query entirely when there is nothing to look up", async () => {
    fromMock.mockImplementation(() => {
      throw new Error("must not query");
    });
    expect(await findUkOnlyArtists([])).toEqual([]);
    expect(await findUkOnlyArtists(["", "  "])).toEqual([""]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("matches slugs case-insensitively", async () => {
    // Every live slug is lower-case, but the cart's copy is client-held and a
    // difference in case must not reclassify an opted-in artist as UK only.
    mockRows([{ slug: "alice", ships_internationally: true }]);
    expect(await findUkOnlyArtists(["Alice"])).toEqual([]);
  });

  it("de-duplicates, so a three-line cart names the artist once", async () => {
    mockRows([{ slug: "bob", ships_internationally: false }]);
    expect(await findUkOnlyArtists(["bob", "bob", "BOB"])).toEqual(["bob"]);
  });
});
