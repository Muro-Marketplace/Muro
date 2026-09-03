// POST /api/walls/[id]/layouts/[lid]/preview stores the editor's own
// capture of a layout. Boundaries under test:
//   - flag off → 404, no auth → 401
//   - someone else's wall, or a layout under another wall → 404 (no leak)
//   - burst limiter honoured
//   - body shape: multipart `image` or a raw image body; anything else 400
//   - 8 MB cap → 413, checked on the header and again on the bytes
//   - format by magic bytes, not the declared type
//   - happy path persists at zero cost as client_capture and moves the
//     layout's last_render_id + layout_hash

import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import { PREVIEW_MAX_BYTES } from "@/lib/visualizer/preview-image";

const {
  getWallByIdMock,
  getLayoutByIdMock,
  updateLayoutMock,
  persistRenderMock,
  withRateLimitMock,
} = vi.hoisted(() => ({
  getWallByIdMock: vi.fn(),
  getLayoutByIdMock: vi.fn(),
  updateLayoutMock: vi.fn(),
  persistRenderMock: vi.fn(),
  withRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/visualizer/walls-db", () => ({
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
  getLayoutById: (...a: unknown[]) => getLayoutByIdMock(...a),
  updateLayout: (...a: unknown[]) => updateLayoutMock(...a),
}));

vi.mock("@/lib/visualizer/renders-db", () => ({
  persistRender: (...a: unknown[]) => persistRenderMock(...a),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (...a: unknown[]) => withRateLimitMock(...a),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer valid") {
      return { user: { id: "u-real" }, error: null };
    }
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

import { POST } from "./route";

const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const WALL = {
  id: "wall-1",
  user_id: "u-real",
  owner_type: "venue" as const,
  kind: "preset" as const,
  preset_id: "minimal_white",
  source_image_path: null,
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
};

const LAYOUT = {
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
  last_render_id: null,
};

const ctx = { params: Promise.resolve({ id: "wall-1", lid: "lay-1" }) };
const URL_ = "https://w.local/api/walls/wall-1/layouts/lay-1/preview";

function multipart(
  bytes: Uint8Array<ArrayBuffer>,
  opts: { type?: string; field?: string; name?: string; auth?: boolean } = {},
): Request {
  const form = new FormData();
  form.append(
    opts.field ?? "image",
    new File([bytes], opts.name ?? "wall-preview.webp", { type: opts.type ?? "image/webp" }),
  );
  return new Request(URL_, {
    method: "POST",
    headers: opts.auth === false ? {} : { authorization: "Bearer valid" },
    body: form,
  });
}

function raw(bytes: Uint8Array<ArrayBuffer>, contentType: string, extra: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": contentType, ...extra },
    body: bytes,
  });
}

beforeEach(() => {
  getWallByIdMock.mockReset();
  getLayoutByIdMock.mockReset();
  updateLayoutMock.mockReset();
  persistRenderMock.mockReset();
  withRateLimitMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  getWallByIdMock.mockResolvedValue(WALL);
  getLayoutByIdMock.mockResolvedValue(LAYOUT);
  withRateLimitMock.mockResolvedValue(null);
  persistRenderMock.mockResolvedValue({
    render: {
      id: "render-9",
      layout_id: "lay-1",
      user_id: "u-real",
      kind: "standard",
      output_path: "u-real/render-9.webp",
      layout_hash: "whatever",
      cost_units: 0,
      kept: false,
      provider: "client_capture",
      prompt_seed: null,
      created_at: "2026-09-03T12:00:00Z",
    },
    publicUrl: "https://cdn.example/wall-renders/u-real/render-9.webp",
  });
  updateLayoutMock.mockResolvedValue({ ...LAYOUT, last_render_id: "render-9" });
});

describe("POST preview, gating", () => {
  it("404s when the feature flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(404);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("401s without auth", async () => {
    const res = await POST(multipart(WEBP_BYTES, { auth: false }), ctx);
    expect(res.status).toBe(401);
  });

  it("404s for another user's wall, without touching storage", async () => {
    getWallByIdMock.mockResolvedValue({ ...WALL, user_id: "someone-else" });
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(404);
    expect(getLayoutByIdMock).not.toHaveBeenCalled();
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("404s when the layout belongs to a different wall", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, wall_id: "wall-other" });
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(404);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("404s when the layout is owned by someone else", async () => {
    getLayoutByIdMock.mockResolvedValue({ ...LAYOUT, user_id: "someone-else" });
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(404);
  });

  it("honours the per-user burst limiter", async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 }),
    );
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(429);
    expect(withRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "u-real", name: "wall_preview_burst" }),
    );
    expect(persistRenderMock).not.toHaveBeenCalled();
  });
});

describe("POST preview, body validation", () => {
  it("400s on a JSON body", async () => {
    const res = await POST(
      new Request(URL_, {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: JSON.stringify({ image: "..." }),
      }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("400s when the multipart body has no 'image' part", async () => {
    const res = await POST(multipart(WEBP_BYTES, { field: "file" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/image/);
  });

  it("400s on an empty image", async () => {
    const res = await POST(multipart(new Uint8Array([])), ctx);
    expect(res.status).toBe(400);
  });

  it("refuses a JPEG even when it is declared as WebP (magic bytes, not the header)", async () => {
    const res = await POST(multipart(JPEG_BYTES, { type: "image/webp" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/WebP or PNG/);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("refuses an SVG declared as PNG, the XSS-shaped case", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const res = await POST(raw(svg, "image/png"), ctx);
    expect(res.status).toBe(400);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("413s on the declared Content-Length before reading the body", async () => {
    const res = await POST(
      raw(WEBP_BYTES, "image/webp", { "content-length": String(PREVIEW_MAX_BYTES + 1) }),
      ctx,
    );
    expect(res.status).toBe(413);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });

  it("413s on the actual bytes when the header lied or was absent", async () => {
    const big = new Uint8Array(PREVIEW_MAX_BYTES + 1);
    big.set(WEBP_BYTES, 0);
    const res = await POST(multipart(big), ctx);
    expect(res.status).toBe(413);
    expect(persistRenderMock).not.toHaveBeenCalled();
  });
});

describe("POST preview, happy path", () => {
  it("stores a multipart WebP at zero cost as a client capture and repoints the layout", async () => {
    const res = await POST(multipart(WEBP_BYTES), ctx);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.render.id).toBe("render-9");
    expect(json.publicUrl).toBe("https://cdn.example/wall-renders/u-real/render-9.webp");

    expect(persistRenderMock).toHaveBeenCalledTimes(1);
    const input = persistRenderMock.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: "u-real",
      layoutId: "lay-1",
      kind: "standard",
      costUnits: 0,
      provider: "client_capture",
      contentType: "image/webp",
    });
    expect(Buffer.isBuffer(input.imageBuffer)).toBe(true);
    expect(Array.from(input.imageBuffer as Buffer)).toEqual(Array.from(WEBP_BYTES));

    // The hash is the stored layout's, the same one the render route computes.
    const expectedHash = computeLayoutHash({
      items: LAYOUT.items as never,
      background: { kind: "preset", preset_id: "minimal_white", color_hex: "F5F1EB" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(input.layoutHash).toBe(expectedHash);
    expect(updateLayoutMock).toHaveBeenCalledWith("lay-1", {
      last_render_id: "render-9",
      layout_hash: expectedHash,
    });
  });

  it("accepts a raw PNG body and stores it as PNG", async () => {
    const res = await POST(raw(PNG_BYTES, "image/png"), ctx);
    expect(res.status).toBe(200);
    expect(persistRenderMock.mock.calls[0][0]).toMatchObject({
      contentType: "image/png",
      costUnits: 0,
    });
  });

  it("hashes an uploaded wall by its photo path", async () => {
    getWallByIdMock.mockResolvedValue({
      ...WALL,
      kind: "uploaded",
      preset_id: null,
      source_image_path: "u-real/photo.jpg",
    });
    await POST(multipart(WEBP_BYTES), ctx);
    const expectedHash = computeLayoutHash({
      items: LAYOUT.items as never,
      background: { kind: "uploaded", image_path: "u-real/photo.jpg" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(persistRenderMock.mock.calls[0][0].layoutHash).toBe(expectedHash);
  });

  it("500s when storage fails, and never touches the layout pointer", async () => {
    persistRenderMock.mockResolvedValue(null);
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("persistence_failed");
    expect(updateLayoutMock).not.toHaveBeenCalled();
  });

  it("500s rather than claim success when the layout pointer cannot be moved", async () => {
    updateLayoutMock.mockResolvedValue(null);
    const res = await POST(multipart(WEBP_BYTES), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("layout_update_failed");
  });
});
