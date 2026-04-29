// Layout detail route, interesting boundaries:
//   - feature flag off → 404
//   - non-owner gets 404 (not 403, don't leak existence)
//   - layout under a different wall → 404
//   - PATCH recomputes hash when items change
//   - PATCH leaves hash alone when only name changes

import { describe, expect, it, vi, beforeEach } from "vitest";

const getWallByIdMock = vi.fn();
const getLayoutByIdMock = vi.fn();
const updateLayoutMock = vi.fn();
const deleteLayoutMock = vi.fn();

vi.mock("@/lib/visualizer/walls-db", () => ({
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
  getLayoutById: (...a: unknown[]) => getLayoutByIdMock(...a),
  updateLayout: (...a: unknown[]) => updateLayoutMock(...a),
  deleteLayout: (...a: unknown[]) => deleteLayoutMock(...a),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer valid") return { user: { id: "u-real" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

beforeEach(() => {
  vi.resetModules();
  getWallByIdMock.mockReset();
  getLayoutByIdMock.mockReset();
  updateLayoutMock.mockReset();
  deleteLayoutMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
});

const ctxFactory = (id: string, lid: string) => ({
  params: Promise.resolve({ id, lid }),
});

const wallOwn = {
  id: "wall-1",
  user_id: "u-real",
  owner_type: "artist" as const,
  kind: "preset" as const,
  preset_id: "minimal_white",
  source_image_path: null,
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
};

const layoutOwn = {
  id: "lay-1",
  wall_id: "wall-1",
  user_id: "u-real",
  name: "Layout 1",
  items: [
    {
      id: "i1",
      work_id: "w1",
      x_cm: 10,
      y_cm: 20,
      width_cm: 60,
      height_cm: 80,
      rotation_deg: 0,
      z_index: 0,
      frame: { style: "none", finish: "", depth_mm: 0 },
    },
  ],
  layout_hash: "old-hash",
};

describe("GET /api/walls/[id]/layouts/[lid]", () => {
  it("404s when feature flag off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1"),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(404);
  });

  it("404s for non-owner (no leak)", async () => {
    getWallByIdMock.mockResolvedValue({ ...wallOwn, user_id: "someone-else" });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        headers: { authorization: "Bearer valid" },
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(404);
  });

  it("404s when layout belongs to a different wall", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue({ ...layoutOwn, wall_id: "wall-different" });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        headers: { authorization: "Bearer valid" },
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns layout for owner", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue(layoutOwn);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        headers: { authorization: "Bearer valid" },
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.layout.id).toBe("lay-1");
  });
});

describe("PATCH /api/walls/[id]/layouts/[lid], hash recompute", () => {
  it("recomputes layout_hash when items change", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue(layoutOwn);
    updateLayoutMock.mockImplementation((id, patch) =>
      Promise.resolve({ ...layoutOwn, ...patch }),
    );

    const newItems = [
      {
        id: "i1",
        work_id: "w1",
        x_cm: 50, // moved
        y_cm: 50,
        width_cm: 60,
        height_cm: 80,
        rotation_deg: 0,
        z_index: 0,
        frame: { style: "none", finish: "", depth_mm: 0 },
      },
    ];

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        method: "PATCH",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(200);
    const call = updateLayoutMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof call.layout_hash).toBe("string");
    expect((call.layout_hash as string).length).toBe(64);
    expect(call.layout_hash).not.toBe("old-hash");
  });

  it("does NOT touch layout_hash when only name changes", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue(layoutOwn);
    updateLayoutMock.mockImplementation((id, patch) =>
      Promise.resolve({ ...layoutOwn, ...patch }),
    );

    const { PATCH } = await import("./route");
    await PATCH(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        method: "PATCH",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify({ name: "New name" }),
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    const call = updateLayoutMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call.name).toBe("New name");
    expect(call.layout_hash).toBeUndefined();
  });

  it("400s on validation failure (rotation > 15°)", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue(layoutOwn);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        method: "PATCH",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: "i1",
              work_id: "w1",
              x_cm: 0,
              y_cm: 0,
              width_cm: 60,
              height_cm: 80,
              rotation_deg: 45,
              z_index: 0,
              frame: { style: "none", finish: "", depth_mm: 0 },
            },
          ],
        }),
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/walls/[id]/layouts/[lid]", () => {
  it("deletes for owner", async () => {
    getWallByIdMock.mockResolvedValue(wallOwn);
    getLayoutByIdMock.mockResolvedValue(layoutOwn);
    deleteLayoutMock.mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        method: "DELETE",
        headers: { authorization: "Bearer valid" },
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(200);
    expect(deleteLayoutMock).toHaveBeenCalledWith("lay-1");
  });

  it("404s for non-owner without calling delete", async () => {
    getWallByIdMock.mockResolvedValue({ ...wallOwn, user_id: "someone-else" });
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("https://w.local/api/walls/wall-1/layouts/lay-1", {
        method: "DELETE",
        headers: { authorization: "Bearer valid" },
      }),
      ctxFactory("wall-1", "lay-1"),
    );
    expect(res.status).toBe(404);
    expect(deleteLayoutMock).not.toHaveBeenCalled();
  });
});
