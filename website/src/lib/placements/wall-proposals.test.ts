// The proposal is a wall_layouts row on the venue's wall named after the
// placement id. These cover the name convention, the create-or-clean-up
// path, the one-query resolution for a placement list, and every part of the
// link check the placement route relies on.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import type { Wall, WallItem } from "@/lib/visualizer/types";

const {
  createLayoutMock,
  updateLayoutMock,
  deleteLayoutMock,
  getLayoutByIdMock,
  getWallByIdMock,
  persistRenderMock,
} = vi.hoisted(() => ({
  createLayoutMock: vi.fn(),
  updateLayoutMock: vi.fn(),
  deleteLayoutMock: vi.fn(),
  getLayoutByIdMock: vi.fn(),
  getWallByIdMock: vi.fn(),
  persistRenderMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the test passes its own client");
  },
}));
vi.mock("@/lib/visualizer/walls-db", () => ({
  createLayout: (...a: unknown[]) => createLayoutMock(...a),
  updateLayout: (...a: unknown[]) => updateLayoutMock(...a),
  deleteLayout: (...a: unknown[]) => deleteLayoutMock(...a),
  getLayoutById: (...a: unknown[]) => getLayoutByIdMock(...a),
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
}));
vi.mock("@/lib/visualizer/renders-db", () => ({
  persistRender: (...a: unknown[]) => persistRenderMock(...a),
  getPublicRenderUrl: (path: string) => `https://cdn.example/wall-renders/${path}`,
}));

import {
  countRecentWallProposals,
  createWallProposal,
  getWallProposalsForPlacements,
  parseProposalLayoutName,
  placementExists,
  proposalLayoutName,
  verifyWallProposalLink,
} from "./wall-proposals";

const WALL: Wall = {
  id: "wall-1",
  user_id: "u-venue",
  owner_type: "venue",
  name: "Front room",
  kind: "preset",
  preset_id: "minimal_white",
  source_image_path: null,
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
  perspective_homography: null,
  segmentation_mask_path: null,
  notes: null,
  is_public_on_profile: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const ITEMS: WallItem[] = [
  {
    id: "i1",
    work_id: "work-1",
    x_cm: 10,
    y_cm: 20,
    width_cm: 60,
    height_cm: 80,
    rotation_deg: 0,
    z_index: 0,
    frame: { style: "none", finish: "", depth_mm: 0 },
  },
];

const LAYOUT = {
  id: "lay-p1",
  wall_id: "wall-1",
  user_id: "u-artist",
  name: "proposal:pl-1",
  items: ITEMS,
  layout_hash: "h",
  last_render_id: "r1",
  created_at: "2026-09-03T00:00:00Z",
  updated_at: "2026-09-03T00:00:00Z",
};

interface Tables {
  wall_layouts?: Array<Record<string, unknown>>;
  walls?: Array<Record<string, unknown>>;
  wall_renders?: Array<Record<string, unknown>>;
  placements?: Array<Record<string, unknown>>;
  errors?: Record<string, string>;
}

/** Recording query chain: every table answers with its configured rows. */
function fakeClient(tables: Tables) {
  const calls: Array<{ table: string; select: string; opts?: unknown; filters: unknown[] }> = [];
  const client = {
    from: (table: string) => {
      const call = { table, select: "", opts: undefined as unknown, filters: [] as unknown[] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string, opts?: unknown) => {
        call.select = cols;
        call.opts = opts;
        return chain;
      };
      for (const m of ["eq", "in", "like", "gte", "order", "limit"]) {
        chain[m] = (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return chain;
        };
      }
      const result = () => {
        const message = tables.errors?.[table];
        if (message) return { data: null, error: { message }, count: null };
        const rows = (tables as Record<string, unknown>)[table] as Array<Record<string, unknown>> | undefined;
        return { data: rows ?? [], error: null, count: (rows ?? []).length };
      };
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      chain.maybeSingle = async () => {
        const r = result();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error };
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  createLayoutMock.mockReset();
  updateLayoutMock.mockReset();
  deleteLayoutMock.mockReset();
  getLayoutByIdMock.mockReset();
  getWallByIdMock.mockReset();
  persistRenderMock.mockReset();
});

describe("proposal layout names", () => {
  it("round-trips a placement id", () => {
    expect(proposalLayoutName("pl-1")).toBe("proposal:pl-1");
    expect(parseProposalLayoutName("proposal:pl-1")).toBe("pl-1");
  });

  it("rejects anything that is not a proposal name", () => {
    expect(parseProposalLayoutName("Layout 1")).toBeNull();
    expect(parseProposalLayoutName("proposal:")).toBeNull();
    expect(parseProposalLayoutName(null)).toBeNull();
    expect(parseProposalLayoutName(undefined)).toBeNull();
  });
});

describe("createWallProposal", () => {
  const { client } = fakeClient({});
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);

  it("creates the layout as the artist on the venue wall, stores the capture at zero cost, and points the layout at it", async () => {
    createLayoutMock.mockResolvedValue({ ...LAYOUT, last_render_id: null });
    persistRenderMock.mockResolvedValue({
      render: { id: "r-new" },
      publicUrl: "https://cdn.example/wall-renders/u-artist/r-new.webp",
    });
    updateLayoutMock.mockResolvedValue({ ...LAYOUT, last_render_id: "r-new" });

    const out = await createWallProposal(
      { artistUserId: "u-artist", wall: WALL, items: ITEMS, placementId: "pl-1", imageBuffer: bytes, contentType: "image/webp" },
      client,
    );

    const expectedHash = computeLayoutHash({
      items: ITEMS,
      background: { kind: "preset", preset_id: "minimal_white", color_hex: "F5F1EB" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(out).toEqual({
      layoutId: "lay-p1",
      renderId: "r-new",
      previewUrl: "https://cdn.example/wall-renders/u-artist/r-new.webp",
      layoutHash: expectedHash,
    });
    expect(createLayoutMock).toHaveBeenCalledWith(
      { user_id: "u-artist", wall_id: "wall-1", name: "proposal:pl-1", items: ITEMS, layout_hash: expectedHash },
      client,
    );
    expect(persistRenderMock.mock.calls[0][0]).toMatchObject({
      userId: "u-artist",
      layoutId: "lay-p1",
      kind: "standard",
      layoutHash: expectedHash,
      costUnits: 0,
      provider: "client_capture",
      contentType: "image/webp",
    });
    expect(updateLayoutMock).toHaveBeenCalledWith("lay-p1", { last_render_id: "r-new" }, client);
    expect(deleteLayoutMock).not.toHaveBeenCalled();
  });

  it("hashes an uploaded wall by its photo path", async () => {
    createLayoutMock.mockResolvedValue(LAYOUT);
    persistRenderMock.mockResolvedValue({ render: { id: "r" }, publicUrl: "u" });
    updateLayoutMock.mockResolvedValue(LAYOUT);
    await createWallProposal(
      {
        artistUserId: "u-artist",
        wall: { ...WALL, kind: "uploaded", preset_id: null, source_image_path: "u-venue/front.jpg" },
        items: ITEMS,
        placementId: "pl-1",
        imageBuffer: bytes,
      },
      client,
    );
    expect(persistRenderMock.mock.calls[0][0].layoutHash).toBe(
      computeLayoutHash({
        items: ITEMS,
        background: { kind: "uploaded", image_path: "u-venue/front.jpg" },
        width_cm: 300,
        height_cm: 240,
      }),
    );
  });

  it("returns null and stores nothing when the layout cannot be created", async () => {
    createLayoutMock.mockResolvedValue(null);
    const out = await createWallProposal(
      { artistUserId: "u-artist", wall: WALL, items: ITEMS, placementId: "pl-1", imageBuffer: bytes },
      client,
    );
    expect(out).toBeNull();
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("removes the layout again when the capture cannot be stored, so no proposal exists without a preview", async () => {
    createLayoutMock.mockResolvedValue(LAYOUT);
    persistRenderMock.mockResolvedValue(null);
    deleteLayoutMock.mockResolvedValue(true);
    const out = await createWallProposal(
      { artistUserId: "u-artist", wall: WALL, items: ITEMS, placementId: "pl-1", imageBuffer: bytes },
      client,
    );
    expect(out).toBeNull();
    expect(deleteLayoutMock).toHaveBeenCalledWith("lay-p1", client);
    expect(updateLayoutMock).not.toHaveBeenCalled();
  });

  it("removes the layout again when the pointer cannot be written", async () => {
    createLayoutMock.mockResolvedValue(LAYOUT);
    persistRenderMock.mockResolvedValue({ render: { id: "r" }, publicUrl: "u" });
    updateLayoutMock.mockResolvedValue(null);
    deleteLayoutMock.mockResolvedValue(true);
    const out = await createWallProposal(
      { artistUserId: "u-artist", wall: WALL, items: ITEMS, placementId: "pl-1", imageBuffer: bytes },
      client,
    );
    expect(out).toBeNull();
    expect(deleteLayoutMock).toHaveBeenCalledWith("lay-p1", client);
  });
});

describe("getWallProposalsForPlacements", () => {
  it("returns nothing, and queries nothing, for an empty list", async () => {
    const { client, calls } = fakeClient({});
    expect(await getWallProposalsForPlacements([], client)).toEqual({});
    expect(await getWallProposalsForPlacements(["", ""], client)).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("resolves every placement's proposal with one layouts query, then the walls and renders they point at", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [
        { id: "lay-a", wall_id: "wall-1", name: "proposal:pl-a", last_render_id: "r-a" },
        { id: "lay-b", wall_id: "wall-2", name: "proposal:pl-b", last_render_id: "r-b" },
        // A proposal whose capture never landed is not a proposal.
        { id: "lay-c", wall_id: "wall-1", name: "proposal:pl-c", last_render_id: null },
      ],
      walls: [
        { id: "wall-1", name: "Front room" },
        { id: "wall-2", name: "Bar" },
      ],
      wall_renders: [
        { id: "r-a", output_path: "u-artist/r-a.webp" },
        { id: "r-b", output_path: "u-artist/r-b.png" },
      ],
    });

    const out = await getWallProposalsForPlacements(["pl-a", "pl-b", "pl-c", "pl-none", "pl-a"], client);

    expect(out).toEqual({
      "pl-a": { layoutId: "lay-a", wallId: "wall-1", wallName: "Front room", previewUrl: "https://cdn.example/wall-renders/u-artist/r-a.webp" },
      "pl-b": { layoutId: "lay-b", wallId: "wall-2", wallName: "Bar", previewUrl: "https://cdn.example/wall-renders/u-artist/r-b.png" },
    });
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts", "walls", "wall_renders"]);
    expect(calls[0].select).toBe("id, wall_id, name, last_render_id");
    expect(calls[0].filters).toEqual([
      ["in", "name", ["proposal:pl-a", "proposal:pl-b", "proposal:pl-c", "proposal:pl-none"]],
    ]);
    expect(calls[1].filters).toEqual([["in", "id", ["wall-1", "wall-2"]]]);
    expect(calls[2].filters).toEqual([["in", "id", ["r-a", "r-b"]]]);
  });

  it("skips the second round of queries when no proposal has a render", async () => {
    const { client, calls } = fakeClient({
      wall_layouts: [{ id: "lay-c", wall_id: "wall-1", name: "proposal:pl-c", last_render_id: null }],
    });
    expect(await getWallProposalsForPlacements(["pl-c"], client)).toEqual({});
    expect(calls.map((c) => c.table)).toEqual(["wall_layouts"]);
  });

  it("drops a proposal whose render or wall row is missing rather than inventing one", async () => {
    const { client } = fakeClient({
      wall_layouts: [
        { id: "lay-a", wall_id: "wall-1", name: "proposal:pl-a", last_render_id: "r-gone" },
        { id: "lay-b", wall_id: "wall-gone", name: "proposal:pl-b", last_render_id: "r-b" },
      ],
      walls: [{ id: "wall-1", name: "Front room" }],
      wall_renders: [{ id: "r-b", output_path: "u/r-b.webp" }],
    });
    expect(await getWallProposalsForPlacements(["pl-a", "pl-b"], client)).toEqual({});
  });

  it("fails soft to an empty map on a database error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "connection reset" } });
    expect(await getWallProposalsForPlacements(["pl-a"], client)).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("fails soft when the client throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { from: () => undefined } as unknown as SupabaseClient;
    expect(await getWallProposalsForPlacements(["pl-a"], broken)).toEqual({});
    warn.mockRestore();
  });
});

describe("verifyWallProposalLink", () => {
  const input = { layoutId: "lay-p1", placementId: "pl-1", artistUserId: "u-artist", venueUserId: "u-venue" };

  it("accepts the artist's own proposal for this placement on the venue's public wall, with its preview URL", async () => {
    getLayoutByIdMock.mockResolvedValue(LAYOUT);
    getWallByIdMock.mockResolvedValue(WALL);
    const { client } = fakeClient({ wall_renders: [{ id: "r1", output_path: "u-artist/r1.webp" }] });

    const out = await verifyWallProposalLink(input, client);

    expect(out).toEqual({
      ok: true,
      layout: LAYOUT,
      wall: WALL,
      previewUrl: "https://cdn.example/wall-renders/u-artist/r1.webp",
    });
    expect(getLayoutByIdMock).toHaveBeenCalledWith("lay-p1", client);
    expect(getWallByIdMock).toHaveBeenCalledWith("wall-1", client);
  });

  it("still accepts when the render row cannot be read, with a null preview", async () => {
    getLayoutByIdMock.mockResolvedValue(LAYOUT);
    getWallByIdMock.mockResolvedValue(WALL);
    const { client } = fakeClient({ errors: { wall_renders: "boom" } });
    const out = await verifyWallProposalLink(input, client);
    expect(out.ok).toBe(true);
    expect(out.ok && out.previewUrl).toBeNull();
  });

  it("refuses a missing layout", async () => {
    getLayoutByIdMock.mockResolvedValue(null);
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall proposal no longer exists." });
    expect(getWallByIdMock).not.toHaveBeenCalled();
  });

  it("refuses another artist's proposal", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, user_id: "u-someone" });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall proposal isn't yours." });
  });

  it("refuses a proposal made for a different placement id", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, name: "proposal:pl-other" });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall proposal belongs to a different request." });
  });

  it("refuses an ordinary layout that merely happens to be the artist's", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, name: "Layout 1" });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out.ok).toBe(false);
  });

  it("refuses a proposal with no preview", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, last_render_id: null });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall proposal has no preview image." });
  });

  it("refuses a wall that is not this venue's", async () => {
    getLayoutByIdMock.mockResolvedValue(LAYOUT);
    getWallByIdMock.mockResolvedValue({ ...WALL, user_id: "u-other-venue" });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall proposal isn't on this venue's wall." });
  });

  it("refuses a wall the venue has since made private", async () => {
    getLayoutByIdMock.mockResolvedValue(LAYOUT);
    getWallByIdMock.mockResolvedValue({ ...WALL, is_public_on_profile: false });
    const out = await verifyWallProposalLink(input, fakeClient({}).client);
    expect(out).toEqual({ ok: false, reason: "That wall is no longer open to proposals." });
  });
});

describe("countRecentWallProposals", () => {
  it("counts the artist's proposal layouts since the cutoff", async () => {
    const { client, calls } = fakeClient({ wall_layouts: [{ id: "a" }, { id: "b" }] });
    const since = new Date("2026-09-02T12:00:00Z");
    expect(await countRecentWallProposals("u-artist", since, client)).toBe(2);
    expect(calls[0].table).toBe("wall_layouts");
    expect(calls[0].select).toBe("id");
    expect(calls[0].opts).toEqual({ count: "exact", head: true });
    expect(calls[0].filters).toEqual([
      ["eq", "user_id", "u-artist"],
      ["like", "name", "proposal:%"],
      ["gte", "created_at", "2026-09-02T12:00:00.000Z"],
    ]);
  });

  it("reads as zero on a database error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ errors: { wall_layouts: "boom" } });
    expect(await countRecentWallProposals("u-artist", new Date(), client)).toBe(0);
    warn.mockRestore();
  });
});

describe("placementExists", () => {
  it("answers true for a known id, false for an unknown one, null on error", async () => {
    expect(await placementExists("pl-1", fakeClient({ placements: [{ id: "pl-1" }] }).client)).toBe(true);
    expect(await placementExists("pl-2", fakeClient({ placements: [] }).client)).toBe(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await placementExists("pl-1", fakeClient({ errors: { placements: "boom" } }).client)).toBeNull();
    warn.mockRestore();
  });
});
