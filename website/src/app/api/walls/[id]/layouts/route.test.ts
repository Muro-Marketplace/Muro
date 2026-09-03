// /api/walls/[id]/layouts lists and counts the OWNER's layouts only. An
// artist's wall proposal is a layout on the venue's wall under the artist's
// user_id, so the owner id travels with every read here.

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getWallByIdMock,
  listLayoutsByWallMock,
  countLayoutsByWallMock,
  createLayoutMock,
  resolveTierMock,
  getTierLimitsMock,
} = vi.hoisted(() => ({
  getWallByIdMock: vi.fn(),
  listLayoutsByWallMock: vi.fn(),
  countLayoutsByWallMock: vi.fn(),
  createLayoutMock: vi.fn(),
  resolveTierMock: vi.fn(),
  getTierLimitsMock: vi.fn(),
}));

vi.mock("@/lib/visualizer/walls-db", () => ({
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
  listLayoutsByWall: (...a: unknown[]) => listLayoutsByWallMock(...a),
  countLayoutsByWall: (...a: unknown[]) => countLayoutsByWallMock(...a),
  createLayout: (...a: unknown[]) => createLayoutMock(...a),
}));
vi.mock("@/lib/visualizer/tier-resolver", () => ({
  resolveTier: (...a: unknown[]) => resolveTierMock(...a),
}));
vi.mock("@/lib/visualizer/tier-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visualizer/tier-limits")>(
    "@/lib/visualizer/tier-limits",
  );
  return { ...actual, getTierLimits: (...a: unknown[]) => getTierLimitsMock(...a) };
});
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer valid") {
      return { user: { id: "u-venue" }, error: null };
    }
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

import { GET, POST } from "./route";

const WALL = {
  id: "wall-1",
  user_id: "u-venue",
  owner_type: "venue",
  kind: "preset",
  preset_id: "minimal_white",
  source_image_path: null,
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
};

const ctx = { params: Promise.resolve({ id: "wall-1" }) };
const get = () =>
  GET(new Request("https://w.local/api/walls/wall-1/layouts", { headers: { authorization: "Bearer valid" } }), ctx);
const post = (body: unknown) =>
  POST(
    new Request("https://w.local/api/walls/wall-1/layouts", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx,
  );

beforeEach(() => {
  getWallByIdMock.mockReset();
  listLayoutsByWallMock.mockReset();
  countLayoutsByWallMock.mockReset();
  createLayoutMock.mockReset();
  resolveTierMock.mockReset();
  getTierLimitsMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  getWallByIdMock.mockResolvedValue(WALL);
  listLayoutsByWallMock.mockResolvedValue([{ id: "lay-1", user_id: "u-venue" }]);
  countLayoutsByWallMock.mockResolvedValue(0);
  resolveTierMock.mockResolvedValue("venue_standard");
  getTierLimitsMock.mockReturnValue({ saved_layouts_per_wall: 3 });
  createLayoutMock.mockResolvedValue({ id: "lay-new", user_id: "u-venue", wall_id: "wall-1", items: [] });
});

describe("GET /api/walls/[id]/layouts", () => {
  it("lists the owner's layouts, scoped by the caller's id", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).layouts).toHaveLength(1);
    expect(listLayoutsByWallMock).toHaveBeenCalledWith("wall-1", "u-venue");
  });

  it("404s a wall the caller does not own without listing anything", async () => {
    getWallByIdMock.mockResolvedValue({ ...WALL, user_id: "someone-else" });
    expect((await get()).status).toBe(404);
    expect(listLayoutsByWallMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/walls/[id]/layouts", () => {
  it("counts only the owner's layouts against the cap", async () => {
    countLayoutsByWallMock.mockResolvedValue(3);
    const res = await post({ wall_id: "wall-1", name: "Layout 4", items: [] });
    expect(res.status).toBe(402);
    expect(countLayoutsByWallMock).toHaveBeenCalledWith("wall-1", "u-venue");
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("creates the layout as the owner when under the cap", async () => {
    countLayoutsByWallMock.mockResolvedValue(2);
    const res = await post({ wall_id: "wall-1", name: "Layout 3", items: [] });
    expect(res.status).toBe(201);
    expect(createLayoutMock.mock.calls[0][0]).toMatchObject({
      user_id: "u-venue",
      wall_id: "wall-1",
      name: "Layout 3",
    });
  });
});
