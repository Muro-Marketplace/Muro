// GET /api/venues/[slug]/walls/[wallId] serves one public venue wall to an
// entitled caller and 404s everyone else, so the wall id is never an oracle.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, isFlagOnMock, getOptionalUserMock, resolveSubscriptionMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  getOptionalUserMock: vi.fn(),
  resolveSubscriptionMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/front" }, error: null }),
      }),
    },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: getOptionalUserMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: resolveSubscriptionMock }));

import { GET } from "./route";

const VENUE = { user_id: "u-venue", slug: "copper-kettle", name: "The Copper Kettle" };

const WALL = {
  id: "w1",
  user_id: "u-venue",
  owner_type: "venue",
  name: "Front room",
  kind: "uploaded",
  preset_id: null,
  source_image_path: "u-venue/front.jpg",
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

function installDb(venue: unknown, wall: unknown) {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({
      data: table === "venue_profiles" ? venue : table === "walls" ? wall : null,
      error: null,
    });
    return chain;
  });
}

const ctx = (slug = "copper-kettle", wallId = "w1") => ({ params: Promise.resolve({ slug, wallId }) });
const req = () => new Request("http://localhost/api/venues/copper-kettle/walls/w1");

beforeEach(() => {
  fromMock.mockReset();
  isFlagOnMock.mockReset();
  getOptionalUserMock.mockReset();
  resolveSubscriptionMock.mockReset();

  installDb(VENUE, WALL);
  isFlagOnMock.mockReturnValue(true);
  // A subscribed artist, the caller the propose page exists for.
  getOptionalUserMock.mockResolvedValue({ user: { id: "u-artist", user_metadata: { user_type: "artist" } } });
  resolveSubscriptionMock.mockResolvedValue({ active: true });
});

describe("GET /api/venues/[slug]/walls/[wallId]", () => {
  it("404s when the wall kill-switch is off, before any read", async () => {
    isFlagOnMock.mockReturnValue(false);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
    expect(isFlagOnMock).toHaveBeenCalledWith("WALL_VISUALIZER_V1");
  });

  it("400s on an over-long slug or wall id", async () => {
    expect((await GET(req(), ctx("x".repeat(101), "w1"))).status).toBe(400);
    expect((await GET(req(), ctx("copper-kettle", "w".repeat(65)))).status).toBe(400);
  });

  it("404s for an unknown slug", async () => {
    installDb(null, WALL);
    const res = await GET(req(), ctx("nobody"));
    expect(res.status).toBe(404);
  });

  it("404s for a private wall", async () => {
    installDb(VENUE, { ...WALL, is_public_on_profile: false });
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("404s for a wall that belongs to a different venue", async () => {
    installDb(VENUE, { ...WALL, user_id: "u-other-venue" });
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("404s for an anonymous caller and for an unsubscribed artist, same as the profile", async () => {
    getOptionalUserMock.mockResolvedValue({ user: null });
    expect((await GET(req(), ctx())).status).toBe(404);

    getOptionalUserMock.mockResolvedValue({ user: { id: "u-artist", user_metadata: { user_type: "artist" } } });
    resolveSubscriptionMock.mockResolvedValue({ active: false });
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("serves the public shape with a signed photo URL to a subscribed artist", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      wall: {
        id: "w1",
        name: "Front room",
        width_cm: 300,
        height_cm: 240,
        kind: "uploaded",
        preset_id: null,
        wall_color_hex: "F5F1EB",
        source_image_url: "https://signed.example/front",
      },
    });
    expect(JSON.stringify(body)).not.toContain("u-venue");
    expect(JSON.stringify(body)).not.toContain("front.jpg");
  });

  it("serves the wall to its own venue without a subscription check", async () => {
    getOptionalUserMock.mockResolvedValue({ user: { id: "u-venue", user_metadata: { user_type: "venue" } } });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(resolveSubscriptionMock).not.toHaveBeenCalled();
  });
});
