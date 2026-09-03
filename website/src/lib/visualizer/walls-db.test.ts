// Layout reads on a wall are the OWNER's layouts only. An artist's wall
// proposal (src/lib/placements/wall-proposals.ts) is a wall_layouts row on
// the venue's wall under the artist's user_id, so getWallPreviewUrls,
// listLayoutsByWall and countLayoutsByWall all filter on the owner: without
// that the proposal shows in the venue's editor, counts against its layout
// cap, and (being the newest layout) replaces the venue's saved preview on
// My Walls and the public profile.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the test passes its own client");
  },
}));

import { countLayoutsByWall, getWallPreviewUrls, listLayoutsByWall } from "./walls-db";

interface Tables {
  wall_layouts?: Array<Record<string, unknown>>;
  wall_renders?: Array<{ id: string; output_path: string | null }>;
  errors?: Partial<Record<"wall_layouts" | "wall_renders", string>>;
}

/** Thenable query chain that records the filters it was given. */
function fakeClient(tables: Tables) {
  const calls: Array<{ table: string; select: string; selectOpts?: unknown; filters: unknown[] }> = [];
  const client = {
    from: (table: keyof Tables & string) => {
      const call = { table, select: "", selectOpts: undefined as unknown, filters: [] as unknown[] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string, opts?: unknown) => {
        call.select = cols;
        call.selectOpts = opts;
        return chain;
      };
      for (const m of ["eq", "in", "order"]) {
        chain[m] = (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) => {
        const message = tables.errors?.[table as "wall_layouts" | "wall_renders"];
        const rows = (tables as Record<string, unknown>)[table] as unknown[] | undefined;
        const result = message
          ? { data: null, error: { message }, count: null }
          : { data: rows ?? [], error: null, count: (rows ?? []).length };
        return Promise.resolve(result).then(resolve);
      };
      return chain;
    },
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example/wall-renders/${path}` },
        }),
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const OWNED = [
  { id: "w1", user_id: "u1" },
  { id: "w2", user_id: "u1" },
  { id: "w3", user_id: "u1" },
];

describe("getWallPreviewUrls", () => {
  it("returns nothing, and queries nothing, for an empty list", async () => {
    const { client, calls } = fakeClient({});
    expect(await getWallPreviewUrls([], client)).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("maps each wall to the public URL of its newest layout's render, in two queries", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [
        // Newest first, as the query orders them. w1's newest layout has a
        // render; w2's newest has none but an older one does; w3 has none.
        { wall_id: "w1", user_id: "u1", last_render_id: "r-new", updated_at: "2026-09-03T10:00:00Z" },
        { wall_id: "w1", user_id: "u1", last_render_id: "r-old", updated_at: "2026-09-01T10:00:00Z" },
        { wall_id: "w2", user_id: "u1", last_render_id: null, updated_at: "2026-09-02T10:00:00Z" },
        { wall_id: "w2", user_id: "u1", last_render_id: "r-w2", updated_at: "2026-08-30T10:00:00Z" },
        { wall_id: "w3", user_id: "u1", last_render_id: null, updated_at: "2026-08-30T10:00:00Z" },
      ],
      wall_renders: [
        { id: "r-new", output_path: "u1/r-new.webp" },
        { id: "r-old", output_path: "u1/r-old.webp" },
        { id: "r-w2", output_path: "u1/r-w2.png" },
      ],
    });

    const out = await getWallPreviewUrls(OWNED, client);

    expect(out).toEqual({
      w1: "https://cdn.example/wall-renders/u1/r-new.webp",
      w2: "https://cdn.example/wall-renders/u1/r-w2.png",
    });
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts", "wall_renders"]);
    expect(calls[0].select).toBe("wall_id, user_id, last_render_id, updated_at");
    expect(calls[0].filters).toContainEqual(["in", "wall_id", ["w1", "w2", "w3"]]);
    expect(calls[0].filters).toContainEqual(["order", "updated_at", { ascending: false }]);
    expect(calls[1].select).toBe("id, output_path");
    // Only the winning render per wall is looked up, not every layout's.
    expect(calls[1].filters).toContainEqual(["in", "id", ["r-new", "r-w2"]]);
  });

  it("ignores an artist's proposal on the venue's wall, even when it is the newest layout", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [
        { wall_id: "w1", user_id: "u-artist", last_render_id: "r-proposal", updated_at: "2026-09-03T12:00:00Z" },
        { wall_id: "w1", user_id: "u1", last_render_id: "r-own", updated_at: "2026-09-01T10:00:00Z" },
        // A wall whose only rendered layout is a proposal has no preview.
        { wall_id: "w2", user_id: "u-artist", last_render_id: "r-proposal-2", updated_at: "2026-09-03T12:00:00Z" },
      ],
      wall_renders: [
        { id: "r-proposal", output_path: "u-artist/r-proposal.webp" },
        { id: "r-own", output_path: "u1/r-own.webp" },
        { id: "r-proposal-2", output_path: "u-artist/r-proposal-2.webp" },
      ],
    });

    const out = await getWallPreviewUrls(OWNED, client);

    expect(out).toEqual({ w1: "https://cdn.example/wall-renders/u1/r-own.webp" });
    expect(calls[1].filters).toContainEqual(["in", "id", ["r-own"]]);
  });

  it("skips the render query when no layout has a render", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [{ wall_id: "w1", user_id: "u1", last_render_id: null, updated_at: "2026-09-03T10:00:00Z" }],
    });
    expect(await getWallPreviewUrls(OWNED, client)).toEqual({});
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts"]);
  });

  it("drops a wall whose render row is missing rather than inventing a URL", async () => {
    const { client } = fakeClient({
      wall_layouts: [{ wall_id: "w1", user_id: "u1", last_render_id: "gone", updated_at: "2026-09-03T10:00:00Z" }],
      wall_renders: [],
    });
    expect(await getWallPreviewUrls(OWNED, client)).toEqual({});
  });

  it("fails soft on a database error so the wall list still loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "connection reset" } });
    expect(await getWallPreviewUrls(OWNED, client)).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

const LAYOUT_ROW = {
  id: "lay-1",
  wall_id: "w1",
  user_id: "u1",
  name: "Layout 1",
  items: [],
  layout_hash: null,
  last_render_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("listLayoutsByWall", () => {
  it("asks for the owner's layouts on the wall, newest first", async () => {
    const { client, calls } = fakeClient({ wall_layouts: [LAYOUT_ROW] });
    const out = await listLayoutsByWall("w1", "u1", client);
    expect(out.map((l) => l.id)).toEqual(["lay-1"]);
    expect(calls[0].table).toBe("wall_layouts");
    expect(calls[0].filters).toEqual([
      ["eq", "wall_id", "w1"],
      ["eq", "user_id", "u1"],
      ["order", "updated_at", { ascending: false }],
    ]);
  });

  it("reads as empty on a database error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "boom" } });
    expect(await listLayoutsByWall("w1", "u1", client)).toEqual([]);
    error.mockRestore();
  });
});

describe("countLayoutsByWall", () => {
  it("counts only the owner's layouts on the wall, as a head count", async () => {
    const { client, calls } = fakeClient({ wall_layouts: [LAYOUT_ROW, { ...LAYOUT_ROW, id: "lay-2" }] });
    expect(await countLayoutsByWall("w1", "u1", client)).toBe(2);
    expect(calls[0].select).toBe("id");
    expect(calls[0].selectOpts).toEqual({ count: "exact", head: true });
    expect(calls[0].filters).toEqual([
      ["eq", "wall_id", "w1"],
      ["eq", "user_id", "u1"],
    ]);
  });

  it("reads as zero on a database error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "boom" } });
    expect(await countLayoutsByWall("w1", "u1", client)).toBe(0);
    error.mockRestore();
  });
});
