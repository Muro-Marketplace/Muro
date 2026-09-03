// getWallPreviewUrls resolves "which image shows for this wall" for the
// list page and the public venue profile. Two queries for the whole set,
// newest layout wins, walls without a saved preview are absent.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the test passes its own client");
  },
}));

import { getWallPreviewUrls } from "./walls-db";

interface Tables {
  wall_layouts?: Array<{ wall_id: string; last_render_id: string | null; updated_at: string }>;
  wall_renders?: Array<{ id: string; output_path: string | null }>;
  errors?: Partial<Record<"wall_layouts" | "wall_renders", string>>;
}

/** Thenable query chain that records the filters it was given. */
function fakeClient(tables: Tables) {
  const calls: Array<{ table: string; select: string; filters: unknown[] }> = [];
  const client = {
    from: (table: keyof Tables & string) => {
      const call = { table, select: "", filters: [] as unknown[] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        call.select = cols;
        return chain;
      };
      chain.in = (col: string, values: unknown[]) => {
        call.filters.push(["in", col, values]);
        return chain;
      };
      chain.order = (col: string, opts: unknown) => {
        call.filters.push(["order", col, opts]);
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        const message = tables.errors?.[table as "wall_layouts" | "wall_renders"];
        const result = message
          ? { data: null, error: { message } }
          : { data: (tables as Record<string, unknown>)[table] ?? [], error: null };
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

describe("getWallPreviewUrls", () => {
  it("returns nothing, and queries nothing, for an empty id list", async () => {
    const { client, calls } = fakeClient({});
    expect(await getWallPreviewUrls([], client)).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("maps each wall to the public URL of its newest layout's render, in two queries", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [
        // Newest first, as the query orders them. w1's newest layout has a
        // render; w2's newest has none but an older one does; w3 has none.
        { wall_id: "w1", last_render_id: "r-new", updated_at: "2026-09-03T10:00:00Z" },
        { wall_id: "w1", last_render_id: "r-old", updated_at: "2026-09-01T10:00:00Z" },
        { wall_id: "w2", last_render_id: null, updated_at: "2026-09-02T10:00:00Z" },
        { wall_id: "w2", last_render_id: "r-w2", updated_at: "2026-08-30T10:00:00Z" },
        { wall_id: "w3", last_render_id: null, updated_at: "2026-08-30T10:00:00Z" },
      ],
      wall_renders: [
        { id: "r-new", output_path: "u1/r-new.webp" },
        { id: "r-old", output_path: "u1/r-old.webp" },
        { id: "r-w2", output_path: "u1/r-w2.png" },
      ],
    });

    const out = await getWallPreviewUrls(["w1", "w2", "w3"], client);

    expect(out).toEqual({
      w1: "https://cdn.example/wall-renders/u1/r-new.webp",
      w2: "https://cdn.example/wall-renders/u1/r-w2.png",
    });
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts", "wall_renders"]);
    expect(calls[0].select).toBe("wall_id, last_render_id, updated_at");
    expect(calls[0].filters).toContainEqual(["in", "wall_id", ["w1", "w2", "w3"]]);
    expect(calls[0].filters).toContainEqual(["order", "updated_at", { ascending: false }]);
    expect(calls[1].select).toBe("id, output_path");
    // Only the winning render per wall is looked up, not every layout's.
    expect(calls[1].filters).toContainEqual(["in", "id", ["r-new", "r-w2"]]);
  });

  it("skips the render query when no layout has a render", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [{ wall_id: "w1", last_render_id: null, updated_at: "2026-09-03T10:00:00Z" }],
    });
    expect(await getWallPreviewUrls(["w1"], client)).toEqual({});
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts"]);
  });

  it("drops a wall whose render row is missing rather than inventing a URL", async () => {
    const { client } = fakeClient({
      wall_layouts: [{ wall_id: "w1", last_render_id: "gone", updated_at: "2026-09-03T10:00:00Z" }],
      wall_renders: [],
    });
    expect(await getWallPreviewUrls(["w1"], client)).toEqual({});
  });

  it("fails soft on a database error so the wall list still loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "connection reset" } });
    expect(await getWallPreviewUrls(["w1"], client)).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
