import { describe, it, expect, vi, beforeEach } from "vitest";

const { isFlagOnMock, previewsMock, signMock } = vi.hoisted(() => ({
  isFlagOnMock: vi.fn((_flag: string) => true),
  previewsMock: vi.fn(async () => ({}) as Record<string, string>),
  signMock: vi.fn(async (_db: unknown, path: string | null) => (path ? `https://signed/${path}` : null)),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/visualizer/walls-db", () => ({ getWallPreviewUrls: previewsMock }));
vi.mock("@/lib/venues/public-walls", () => ({ signWallPhotoUrl: signMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => { throw new Error("no admin in test"); } }));

import { getPublicShowroomWalls, getShowroomWallCountsBySlug } from "./showroom";

type Result = { data: unknown; error: unknown };
function fakeDb(byTable: Record<string, Result | (() => Result)>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const resolve = () => {
        const r = byTable[table];
        return typeof r === "function" ? r() : (r ?? { data: null, error: { message: `no table ${table}` } });
      };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
      chain.order = async () => resolve();
      chain.then = (ok: (v: Result) => unknown) => Promise.resolve(resolve()).then(ok);
      return chain;
    },
  };
  return { client: client as unknown as import("@supabase/supabase-js").SupabaseClient, calls };
}

const WALL = { id: "w1", user_id: "u1", name: "Studio wall", width_cm: 300, height_cm: 240, kind: "uploaded", wall_color_hex: "F5F1EB", source_image_path: "u1/w1.jpg" };

beforeEach(() => {
  vi.clearAllMocks();
  isFlagOnMock.mockReturnValue(true);
});

describe("getPublicShowroomWalls", () => {
  it("returns the artist's public walls with the saved preview, or the signed photo when there is none", async () => {
    previewsMock.mockResolvedValue({ w1: "https://public/wall-renders/u1/r1.webp" });
    const { client } = fakeDb({ walls: { data: [WALL, { ...WALL, id: "w2", name: " ", source_image_path: "u1/w2.jpg" }], error: null } });
    const walls = await getPublicShowroomWalls("u1", client);
    expect(walls.map((w) => [w.id, w.name, w.preview_image_url, w.source_image_url])).toEqual([
      ["w1", "Studio wall", "https://public/wall-renders/u1/r1.webp", null],
      ["w2", "Showroom wall", null, "https://signed/u1/w2.jpg"],
    ]);
  });

  it("is empty without a user, when the visualiser is off, and when the lookup fails", async () => {
    const { client, calls } = fakeDb({ walls: { data: null, error: { message: "boom" } } });
    expect(await getPublicShowroomWalls(null, client)).toEqual([]);
    expect(await getPublicShowroomWalls("u1", client)).toEqual([]);
    isFlagOnMock.mockReturnValue(false);
    expect(await getPublicShowroomWalls("u1", client)).toEqual([]);
    expect(calls).toEqual(["walls"]);
  });
});

describe("getShowroomWallCountsBySlug", () => {
  it("counts public artist walls per slug", async () => {
    const { client } = fakeDb({
      walls: { data: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }, { user_id: null }], error: null },
      artist_profiles: { data: [{ slug: "maya", user_id: "u1" }, { slug: "tom", user_id: "u2" }], error: null },
    });
    expect(await getShowroomWallCountsBySlug(client)).toEqual({ maya: 2, tom: 1 });
  });

  it("is empty when there are no public walls, on errors, and when the visualiser is off", async () => {
    expect(await getShowroomWallCountsBySlug(fakeDb({ walls: { data: [], error: null } }).client)).toEqual({});
    expect(await getShowroomWallCountsBySlug(fakeDb({ walls: { data: null, error: { message: "x" } } }).client)).toEqual({});
    isFlagOnMock.mockReturnValue(false);
    const { client, calls } = fakeDb({ walls: { data: [{ user_id: "u1" }], error: null } });
    expect(await getShowroomWallCountsBySlug(client)).toEqual({});
    expect(calls).toEqual([]);
  });
});
