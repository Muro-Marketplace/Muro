// /api/walls, GET list, POST create.
//
// Coverage focuses on the interesting boundaries:
//   - feature flag off → 404
//   - unauth GET → 401 (delegated to auth helper)
//   - POST validation
//   - POST tier cap blocks at limit
//   - POST cap=0 (saving disabled) → 402
//   - POST cap=-1 (unlimited) → permitted regardless of count

import { describe, expect, it, vi, beforeEach } from "vitest";

const listWallsByUserMock = vi.fn();
const countWallsByUserMock = vi.fn();
const createPresetWallMock = vi.fn();
const createUploadedWallMock = vi.fn();
const getWallPreviewUrlsMock = vi.fn();
const resolveTierMock = vi.fn();
const getTierLimitsMock = vi.fn();

vi.mock("@/lib/visualizer/walls-db", () => ({
  listWallsByUser: (...a: unknown[]) => listWallsByUserMock(...a),
  countWallsByUser: (...a: unknown[]) => countWallsByUserMock(...a),
  createPresetWall: (...a: unknown[]) => createPresetWallMock(...a),
  createUploadedWall: (...a: unknown[]) => createUploadedWallMock(...a),
  getWallPreviewUrls: (...a: unknown[]) => getWallPreviewUrlsMock(...a),
}));

vi.mock("@/lib/visualizer/tier-resolver", () => ({
  resolveTier: (...a: unknown[]) => resolveTierMock(...a),
}));

vi.mock("@/lib/visualizer/tier-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visualizer/tier-limits")>(
    "@/lib/visualizer/tier-limits",
  );
  return {
    ...actual,
    getTierLimits: (...a: unknown[]) => getTierLimitsMock(...a),
  };
});

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer valid") return { user: { id: "u-real" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

// The route enriches uploaded walls with short-lived signed URLs from
// the wall-photos bucket — that requires the service-role client.
// Tests don't have one configured (intentional: unit tests should never
// hit a real Supabase), so we hand back a stub whose only job is to
// satisfy the `db.storage.from(...).createSignedUrl(...)` call shape.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  listWallsByUserMock.mockReset();
  countWallsByUserMock.mockReset();
  createPresetWallMock.mockReset();
  createUploadedWallMock.mockReset();
  getWallPreviewUrlsMock.mockReset();
  resolveTierMock.mockReset();
  getTierLimitsMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  getWallPreviewUrlsMock.mockResolvedValue({});
  resolveTierMock.mockResolvedValue("artist_premium");
  getTierLimitsMock.mockReturnValue({
    daily: 10,
    monthly: 200,
    wall_uploads_daily: 3,
    saved_walls: 5,
    saved_layouts_per_wall: 10,
    can_publish_showroom: false,
  });
  countWallsByUserMock.mockResolvedValue(0);
  listWallsByUserMock.mockResolvedValue([]);
});

const validPresetBody = {
  kind: "preset",
  name: "Test wall",
  preset_id: "minimal_white",
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
  owner_type: "artist",
};

describe("GET /api/walls", () => {
  it("404s when feature flag off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    const { GET } = await import("./route");
    const res = await GET(new Request("https://w.local/api/walls"));
    expect(res.status).toBe(404);
  });

  it("401s without auth", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("https://w.local/api/walls"));
    expect(res.status).toBe(401);
  });

  it("returns the user's walls with auth", async () => {
    listWallsByUserMock.mockResolvedValue([{ id: "w1", name: "Test" }]);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls", {
        headers: { authorization: "Bearer valid" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walls).toHaveLength(1);
    expect(listWallsByUserMock).toHaveBeenCalledWith("u-real");
  });

  it("attaches the saved preview URL to the walls that have one, resolved for the whole list at once", async () => {
    listWallsByUserMock.mockResolvedValue([
      { id: "w1", name: "Front", kind: "preset" },
      { id: "w2", name: "Back", kind: "preset" },
    ]);
    getWallPreviewUrlsMock.mockResolvedValue({
      w2: "https://cdn.example/wall-renders/u-real/r1.webp",
    });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://w.local/api/walls", {
        headers: { authorization: "Bearer valid" },
      }),
    );
    const json = await res.json();
    expect(getWallPreviewUrlsMock).toHaveBeenCalledTimes(1);
    // The walls go in whole (id + owner), so the lookup can skip layouts
    // that are not the owner's, such as an artist's wall proposal.
    expect(getWallPreviewUrlsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: "w1" }),
      expect.objectContaining({ id: "w2" }),
    ]);
    expect(json.walls[0].preview_image_url).toBeUndefined();
    expect(json.walls[1].preview_image_url).toBe(
      "https://cdn.example/wall-renders/u-real/r1.webp",
    );
  });
});

describe("POST /api/walls, validation + create", () => {
  it("400s on invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on schema failure (missing dimensions)", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify({ kind: "preset", name: "x", owner_type: "artist" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a preset wall successfully", async () => {
    createPresetWallMock.mockResolvedValue({ id: "w-new", name: "Test wall" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify(validPresetBody),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.wall.id).toBe("w-new");
    expect(createPresetWallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u-real",
        owner_type: "artist",
        preset_id: "minimal_white",
      }),
    );
  });
});

describe("POST /api/walls, tier caps", () => {
  it("402s with reason='saved_walls_not_allowed' when cap is 0", async () => {
    getTierLimitsMock.mockReturnValue({
      daily: 0,
      monthly: 0,
      wall_uploads_daily: 0,
      saved_walls: 0,
      saved_layouts_per_wall: 0,
      can_publish_showroom: false,
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify(validPresetBody),
      }),
    );
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.reason).toBe("saved_walls_not_allowed");
    expect(createPresetWallMock).not.toHaveBeenCalled();
  });

  it("402s with reason='saved_walls_cap' when at the limit", async () => {
    getTierLimitsMock.mockReturnValue({
      daily: 10,
      monthly: 200,
      wall_uploads_daily: 3,
      saved_walls: 2,
      saved_layouts_per_wall: 10,
      can_publish_showroom: false,
    });
    countWallsByUserMock.mockResolvedValue(2); // at the cap
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify(validPresetBody),
      }),
    );
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.reason).toBe("saved_walls_cap");
    expect(json.cap).toBe(2);
    expect(createPresetWallMock).not.toHaveBeenCalled();
  });

  it("permits creation when cap is -1 (unlimited) regardless of count", async () => {
    getTierLimitsMock.mockReturnValue({
      daily: 25,
      monthly: 500,
      wall_uploads_daily: 5,
      saved_walls: -1,
      saved_layouts_per_wall: -1,
      can_publish_showroom: true,
    });
    countWallsByUserMock.mockResolvedValue(9999); // would block any positive cap
    createPresetWallMock.mockResolvedValue({ id: "w-pro" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify(validPresetBody),
      }),
    );
    expect(res.status).toBe(201);
    expect(createPresetWallMock).toHaveBeenCalled();
  });

  it("permits creation when under positive cap", async () => {
    countWallsByUserMock.mockResolvedValue(3); // < 5
    createPresetWallMock.mockResolvedValue({ id: "w-ok" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://w.local/api/walls", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify(validPresetBody),
      }),
    );
    expect(res.status).toBe(201);
  });
});
