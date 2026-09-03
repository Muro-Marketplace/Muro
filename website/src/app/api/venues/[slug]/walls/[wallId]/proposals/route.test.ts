// POST /api/venues/[slug]/walls/[wallId]/proposals stores an artist's wall
// proposal. Boundaries under test:
//   - flag off 404, no auth 401, no artist profile 403, under review 403
//   - a private wall or another venue's wall reads as 404, own venue 400
//   - body: multipart only; magic bytes, not the declared type; 8 MB cap
//   - items: 1 to 20, and every work must be the caller's own
//   - placement id must be fresh; 20 proposals per rolling day
//   - happy path creates the layout and the render and returns the URL

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_MAX_BYTES } from "@/lib/visualizer/preview-image";

const {
  fromMock,
  getWallByIdMock,
  createLayoutMock,
  updateLayoutMock,
  deleteLayoutMock,
  persistRenderMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getWallByIdMock: vi.fn(),
  createLayoutMock: vi.fn(),
  updateLayoutMock: vi.fn(),
  deleteLayoutMock: vi.fn(),
  persistRenderMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/visualizer/walls-db", () => ({
  getWallById: (...a: unknown[]) => getWallByIdMock(...a),
  getLayoutById: vi.fn(),
  createLayout: (...a: unknown[]) => createLayoutMock(...a),
  updateLayout: (...a: unknown[]) => updateLayoutMock(...a),
  deleteLayout: (...a: unknown[]) => deleteLayoutMock(...a),
}));
vi.mock("@/lib/visualizer/renders-db", () => ({
  persistRender: (...a: unknown[]) => persistRenderMock(...a),
  getPublicRenderUrl: (path: string) => `https://cdn.example/wall-renders/${path}`,
}));
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer artist") {
      return { user: { id: "u-artist" }, error: null };
    }
    if (req.headers.get("authorization") === "Bearer venue") {
      return { user: { id: "u-venue" }, error: null };
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

const VENUE = { user_id: "u-venue", slug: "copper-kettle", name: "The Copper Kettle" };
const WALL = {
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
  is_public_on_profile: true,
};
const PROFILE = { id: "ap-1", slug: "maya-chen", user_id: "u-artist", review_status: "approved" };

function item(workId: string, x = 10) {
  return {
    id: `item-${workId}-${x}`,
    work_id: workId,
    x_cm: x,
    y_cm: 20,
    width_cm: 60,
    height_cm: 80,
    rotation_deg: 0,
    z_index: 0,
    frame: { style: "none", finish: "", depth_mm: 0 },
  };
}

interface DbState {
  profile?: typeof PROFILE | null;
  venue?: typeof VENUE | null;
  ownedWorkIds?: string[];
  placementExists?: boolean;
  recentProposals?: number;
}

function installDb(state: DbState = {}) {
  const profile = state.profile === undefined ? PROFILE : state.profile;
  const venue = state.venue === undefined ? VENUE : state.venue;
  const owned = state.ownedWorkIds ?? ["work-1", "work-2"];
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    let requestedIds: string[] = [];
    for (const m of ["select", "eq", "like", "gte", "order", "limit"]) chain[m] = () => chain;
    chain.in = (_col: string, ids: string[]) => {
      requestedIds = ids;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "artist_profiles") return { data: profile, error: null };
      if (table === "venue_profiles") return { data: venue, error: null };
      if (table === "placements") return { data: state.placementExists ? { id: "x" } : null, error: null };
      return { data: null, error: null };
    };
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (table === "artist_works") {
        const rows = requestedIds.filter((id) => owned.includes(id)).map((id) => ({ id }));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      if (table === "wall_layouts") {
        return Promise.resolve({ data: null, count: state.recentProposals ?? 0, error: null }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };
    return chain;
  });
}

const URL_ = "https://w.local/api/venues/copper-kettle/walls/wall-1/proposals";
const ctx = { params: Promise.resolve({ slug: "copper-kettle", wallId: "wall-1" }) };

interface ReqOpts {
  bytes?: Uint8Array<ArrayBuffer>;
  type?: string;
  items?: unknown;
  itemsRaw?: string;
  placementId?: string | null;
  auth?: string | null;
  omitImage?: boolean;
}

function multipart(opts: ReqOpts = {}): Request {
  const form = new FormData();
  if (!opts.omitImage) {
    form.append(
      "image",
      new File([opts.bytes ?? WEBP_BYTES], "wall-preview.webp", { type: opts.type ?? "image/webp" }),
    );
  }
  if (opts.itemsRaw !== undefined) form.append("items", opts.itemsRaw);
  else form.append("items", JSON.stringify(opts.items ?? [item("work-1")]));
  if (opts.placementId !== null) form.append("placementId", opts.placementId ?? "pl-1");
  const auth = opts.auth === undefined ? "artist" : opts.auth;
  return new Request(URL_, {
    method: "POST",
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    body: form,
  });
}

beforeEach(() => {
  fromMock.mockReset();
  getWallByIdMock.mockReset();
  createLayoutMock.mockReset();
  updateLayoutMock.mockReset();
  deleteLayoutMock.mockReset();
  persistRenderMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  installDb();
  getWallByIdMock.mockResolvedValue(WALL);
  createLayoutMock.mockResolvedValue({ id: "lay-p1", wall_id: "wall-1", user_id: "u-artist", name: "proposal:pl-1", items: [], layout_hash: "h", last_render_id: null });
  persistRenderMock.mockResolvedValue({
    render: { id: "render-9", output_path: "u-artist/render-9.webp" },
    publicUrl: "https://cdn.example/wall-renders/u-artist/render-9.webp",
  });
  updateLayoutMock.mockResolvedValue({ id: "lay-p1", last_render_id: "render-9" });
});

describe("POST proposals, gating", () => {
  it("404s when the feature flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "0";
    expect((await POST(multipart(), ctx)).status).toBe(404);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("401s without auth", async () => {
    expect((await POST(multipart({ auth: null }), ctx)).status).toBe(401);
  });

  it("403s a caller with no artist profile", async () => {
    installDb({ profile: null });
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("artist_profile_required");
  });

  it("403s an artist still under review, with the placements route's copy", async () => {
    installDb({ profile: { ...PROFILE, review_status: "pending" } });
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("application_pending");
    expect(body.error).toMatch(/still under review/);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("404s a private wall", async () => {
    getWallByIdMock.mockResolvedValue({ ...WALL, is_public_on_profile: false });
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(404);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("404s a wall that is not this venue's, and an unknown venue", async () => {
    getWallByIdMock.mockResolvedValue({ ...WALL, user_id: "u-other" });
    expect((await POST(multipart(), ctx)).status).toBe(404);
    installDb({ venue: null });
    expect((await POST(multipart(), ctx)).status).toBe(404);
  });

  it("400s a venue proposing on its own wall through an artist profile", async () => {
    installDb({ profile: { ...PROFILE, user_id: "u-venue" } });
    const res = await POST(multipart({ auth: "venue" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/own venue/);
  });
});

describe("POST proposals, body validation", () => {
  it("400s a JSON body", async () => {
    const res = await POST(
      new Request(URL_, {
        method: "POST",
        headers: { authorization: "Bearer artist", "content-type": "application/json" },
        body: JSON.stringify({ image: "..." }),
      }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("400s when a part is missing", async () => {
    expect((await POST(multipart({ omitImage: true }), ctx)).status).toBe(400);
    expect((await POST(multipart({ placementId: null }), ctx)).status).toBe(400);
  });

  it("refuses a JPEG declared as WebP, by magic bytes", async () => {
    const res = await POST(multipart({ bytes: JPEG_BYTES, type: "image/webp" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/WebP or PNG/);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("413s an oversize image, on the declared length and on the bytes", async () => {
    const form = new FormData();
    form.append("image", new File([WEBP_BYTES], "p.webp", { type: "image/webp" }));
    form.append("items", JSON.stringify([item("work-1")]));
    form.append("placementId", "pl-1");
    const declared = await POST(
      new Request(URL_, {
        method: "POST",
        headers: { authorization: "Bearer artist", "content-length": String(PREVIEW_MAX_BYTES * 2) },
        body: form,
      }),
      ctx,
    );
    expect(declared.status).toBe(413);

    const big = new Uint8Array(PREVIEW_MAX_BYTES + 1);
    big.set(WEBP_BYTES, 0);
    expect((await POST(multipart({ bytes: big }), ctx)).status).toBe(413);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("400s unparseable items, an empty wall, and more than 20 items", async () => {
    expect((await POST(multipart({ itemsRaw: "{not json" }), ctx)).status).toBe(400);
    expect((await POST(multipart({ items: [] }), ctx)).status).toBe(400);
    const many = Array.from({ length: 21 }, (_, i) => item("work-1", i));
    expect((await POST(multipart({ items: many }), ctx)).status).toBe(400);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("400s an item whose work is not the caller's own", async () => {
    const res = await POST(multipart({ items: [item("work-1"), item("work-stolen")] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("work_not_owned");
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("400s an over-long placement id", async () => {
    expect((await POST(multipart({ placementId: "x".repeat(101) }), ctx)).status).toBe(400);
  });

  it("409s a placement id that already exists", async () => {
    installDb({ placementExists: true });
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(409);
    expect(createLayoutMock).not.toHaveBeenCalled();
  });

  it("429s once the artist has stored 20 proposals in the last day", async () => {
    installDb({ recentProposals: 20 });
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).reason).toBe("wall_proposal_cap");
    expect(createLayoutMock).not.toHaveBeenCalled();
  });
});

describe("POST proposals, happy path", () => {
  it("creates the layout as the artist on the venue wall, stores the capture, and returns the URL", async () => {
    const res = await POST(multipart({ items: [item("work-1"), item("work-2", 120)] }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      layoutId: "lay-p1",
      previewUrl: "https://cdn.example/wall-renders/u-artist/render-9.webp",
    });

    expect(createLayoutMock).toHaveBeenCalledTimes(1);
    expect(createLayoutMock.mock.calls[0][0]).toMatchObject({
      user_id: "u-artist",
      wall_id: "wall-1",
      name: "proposal:pl-1",
    });
    expect(createLayoutMock.mock.calls[0][0].items).toHaveLength(2);

    expect(persistRenderMock).toHaveBeenCalledTimes(1);
    const input = persistRenderMock.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: "u-artist",
      layoutId: "lay-p1",
      kind: "standard",
      costUnits: 0,
      provider: "client_capture",
      contentType: "image/webp",
    });
    expect(Array.from(input.imageBuffer as Buffer)).toEqual(Array.from(WEBP_BYTES));
    expect(updateLayoutMock).toHaveBeenCalledWith("lay-p1", { last_render_id: "render-9" }, expect.anything());
  });

  it("accepts a PNG and stores it as PNG", async () => {
    const res = await POST(multipart({ bytes: PNG_BYTES, type: "image/png" }), ctx);
    expect(res.status).toBe(200);
    expect(persistRenderMock.mock.calls[0][0].contentType).toBe("image/png");
  });

  it("500s, and leaves no proposal layout behind, when the capture cannot be stored", async () => {
    persistRenderMock.mockResolvedValue(null);
    deleteLayoutMock.mockResolvedValue(true);
    const res = await POST(multipart(), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("persistence_failed");
    expect(deleteLayoutMock).toHaveBeenCalledWith("lay-p1", expect.anything());
  });
});
