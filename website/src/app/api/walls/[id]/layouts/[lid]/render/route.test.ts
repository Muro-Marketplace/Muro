// Render route — covers the high-value boundaries:
//   - feature flag off → 404
//   - non-owner → 404
//   - cache hit short-circuits (no quota consumed)
//   - quota exceeded → 429
//   - render service failure → 500 + refund called
//   - persistence failure → 500 + refund called
//   - happy path: persistRender called, layout.last_render_id updated
//
// We don't run sharp here — render-service is mocked. Sharp's behaviour
// is dependency-tested by the npm package itself, and we cover the
// composition math via frames.test.ts and alignment.test.ts.

import { describe, expect, it, vi, beforeEach } from "vitest";

const getWallByIdMock = vi.fn();
const getLayoutByIdMock = vi.fn();
const updateLayoutMock = vi.fn();
const findCachedRenderMock = vi.fn();
const renderLayoutMock = vi.fn();
const persistRenderMock = vi.fn();
const getPublicRenderUrlMock = vi.fn();
const consumeQuotaMock = vi.fn();
const refundQuotaMock = vi.fn();

vi.mock("@/lib/visualizer/walls-db", () => ({
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
  getLayoutById: (...a: unknown[]) => getLayoutByIdMock(...a),
  updateLayout: (...a: unknown[]) => updateLayoutMock(...a),
}));

vi.mock("@/lib/visualizer/render-cache", () => ({
  findCachedRender: (...a: unknown[]) => findCachedRenderMock(...a),
}));

vi.mock("@/lib/visualizer/render-service", () => ({
  renderLayout: (...a: unknown[]) => renderLayoutMock(...a),
}));

vi.mock("@/lib/visualizer/renders-db", () => ({
  persistRender: (...a: unknown[]) => persistRenderMock(...a),
  getPublicRenderUrl: (...a: unknown[]) => getPublicRenderUrlMock(...a),
}));

vi.mock("@/lib/visualizer/quota", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuotaMock(...a),
  refundQuota: (...a: unknown[]) => refundQuotaMock(...a),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          // Support `await db.from('artist_works').select(...).in(...)` shape
          then: (cb: (x: unknown) => unknown) =>
            Promise.resolve(cb({ data: [{ id: "w1", image: "https://example.com/w1.jpg" }], error: null })),
        }),
      }),
    }),
  }),
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
  findCachedRenderMock.mockReset();
  renderLayoutMock.mockReset();
  persistRenderMock.mockReset();
  getPublicRenderUrlMock.mockReset();
  consumeQuotaMock.mockReset();
  refundQuotaMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";

  // Defaults that pass auth + ownership.
  getWallByIdMock.mockResolvedValue({
    id: "wall-1",
    user_id: "u-real",
    owner_type: "artist",
    kind: "preset",
    preset_id: "minimal_white",
    source_image_path: null,
    width_cm: 300,
    height_cm: 240,
    wall_color_hex: "F5F1EB",
  });
  getLayoutByIdMock.mockResolvedValue({
    id: "lay-1",
    wall_id: "wall-1",
    user_id: "u-real",
    name: "Layout",
    items: [
      {
        id: "i1",
        work_id: "w1",
        x_cm: 50,
        y_cm: 60,
        width_cm: 60,
        height_cm: 80,
        rotation_deg: 0,
        z_index: 0,
        frame: { style: "none", finish: "", depth_mm: 0 },
      },
    ],
  });
  findCachedRenderMock.mockResolvedValue(null);
  consumeQuotaMock.mockResolvedValue({
    ok: true,
    remaining_daily: 9,
    remaining_monthly: 199,
  });
  renderLayoutMock.mockResolvedValue({
    buffer: Buffer.from("fake-webp"),
    meta: { width: 1600, height: 1200, itemCount: 1, skippedItems: 0, durationMs: 200 },
  });
  persistRenderMock.mockResolvedValue({
    render: {
      id: "render-1",
      layout_id: "lay-1",
      user_id: "u-real",
      kind: "standard",
      output_path: "u-real/render-1.webp",
      layout_hash: "deadbeef",
      cost_units: 1,
      kept: false,
      provider: null,
      prompt_seed: null,
      created_at: "2026-04-25T12:00:00Z",
    },
    publicUrl: "https://supabase.example.com/storage/render-1.webp",
  });
  updateLayoutMock.mockResolvedValue({});
});

const ctx = (id: string, lid: string) => ({
  params: Promise.resolve({ id, lid }),
});

const POST_REQ = (body: object | null = {}) =>
  new Request("https://w.local/api/walls/wall-1/layouts/lay-1/render", {
    method: "POST",
    headers: {
      authorization: "Bearer valid",
      "content-type": "application/json",
    },
    body: body === null ? undefined : JSON.stringify(body),
  });

describe("POST render — gating", () => {
  it("404s when feature flag off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(404);
  });

  it("401s without auth", async () => {
    const { POST } = await import("./route");
    const req = new Request("https://w.local/api/walls/wall-1/layouts/lay-1/render", {
      method: "POST",
    });
    const res = await POST(req, ctx("wall-1", "lay-1"));
    expect(res.status).toBe(401);
  });

  it("404s for non-owner", async () => {
    getWallByIdMock.mockResolvedValue({ id: "wall-1", user_id: "someone-else" });
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(404);
  });

  it("404s when layout belongs to a different wall", async () => {
    getLayoutByIdMock.mockResolvedValue({
      id: "lay-1",
      wall_id: "OTHER",
      user_id: "u-real",
      items: [],
    });
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(404);
  });
});

describe("POST render — cache hit", () => {
  it("returns cached URL without consuming quota", async () => {
    findCachedRenderMock.mockResolvedValue({
      id: "cached-1",
      layout_id: "lay-1",
      user_id: "u-real",
      kind: "standard",
      output_path: "u-real/cached-1.webp",
      layout_hash: "deadbeef",
      cost_units: 1,
      kept: false,
      provider: null,
      prompt_seed: null,
      created_at: "2026-04-25T11:00:00Z",
    });
    getPublicRenderUrlMock.mockReturnValue("https://example.com/cached-1.webp");

    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.cost_units).toBe(0);
    expect(json.publicUrl).toBe("https://example.com/cached-1.webp");
    expect(consumeQuotaMock).not.toHaveBeenCalled();
    expect(renderLayoutMock).not.toHaveBeenCalled();
  });
});

describe("POST render — quota gate", () => {
  it("429s when quota exceeded, no render attempted", async () => {
    consumeQuotaMock.mockResolvedValue({
      ok: false,
      reason: "daily",
      resets_at: "2026-04-26T00:00:00Z",
      tier: "artist_premium",
    });
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.reason).toBe("daily");
    expect(renderLayoutMock).not.toHaveBeenCalled();
    expect(refundQuotaMock).not.toHaveBeenCalled();
  });

  it("HD render passes action=render_hd and work_ids to the quota gate", async () => {
    // Per-artwork model (5334417): the route no longer passes a flat
    // `units` value — consumeQuota auto-calculates per new work_id.
    // What we can still assert is the action label flows through and
    // the layout's work_ids reach the quota service in metadata.
    const { POST } = await import("./route");
    await POST(POST_REQ({ kind: "hd" }), ctx("wall-1", "lay-1"));
    expect(consumeQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "render_hd",
        metadata: expect.objectContaining({ work_ids: ["w1"] }),
      }),
    );
  });
});

describe("POST render — failure paths refund", () => {
  it("refunds when render-service throws", async () => {
    renderLayoutMock.mockRejectedValue(new Error("sharp blew up"));
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(500);
    expect(refundQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-real",
        originalAction: "render_standard",
        units: 1,
      }),
    );
  });

  it("refunds when persistRender returns null (Storage failure)", async () => {
    persistRenderMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(500);
    expect(refundQuotaMock).toHaveBeenCalled();
  });

  it("does NOT refund on the happy path", async () => {
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(200);
    expect(refundQuotaMock).not.toHaveBeenCalled();
  });
});

describe("POST render — happy path", () => {
  it("renders, persists, updates layout, and returns the URL", async () => {
    const { POST } = await import("./route");
    const res = await POST(POST_REQ(), ctx("wall-1", "lay-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(false);
    expect(json.cost_units).toBe(1);
    expect(json.publicUrl).toBe(
      "https://supabase.example.com/storage/render-1.webp",
    );
    expect(persistRenderMock).toHaveBeenCalled();
    expect(updateLayoutMock).toHaveBeenCalledWith(
      "lay-1",
      expect.objectContaining({ last_render_id: "render-1" }),
    );
  });

  it("validates the body — rejects invalid items", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      POST_REQ({
        items: [
          {
            id: "i1",
            work_id: "w1",
            x_cm: 0,
            y_cm: 0,
            width_cm: 1, // < 5cm — invalid
            height_cm: 80,
            rotation_deg: 0,
            z_index: 0,
            frame: { style: "none", finish: "", depth_mm: 0 },
          },
        ],
      }),
      ctx("wall-1", "lay-1"),
    );
    expect(res.status).toBe(400);
    expect(consumeQuotaMock).not.toHaveBeenCalled();
  });
});
