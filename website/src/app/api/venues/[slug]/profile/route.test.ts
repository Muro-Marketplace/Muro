// 08 §7.1 / D6 item 3. The wall kill-switch had a hole in it.
//
// `WALL_VISUALIZER_V1` gates the visualizer everywhere else, but this route read
// and served `walls` unconditionally. Flipping the flag off to disable the
// feature, which is what a kill-switch is for and includes doing it under
// incident pressure, left this endpoint still publishing every venue's public
// wall list along with the storage paths of uploaded wall photos.
//
// A kill-switch with a hole in it is worse than no kill-switch: it is one
// someone will reach for and believe.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, isFlagOnMock, getOptionalUserMock, resolveSubscriptionMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  getOptionalUserMock: vi.fn(),
  resolveSubscriptionMock: vi.fn(),
}));

// `loadWalls` signs a URL for every uploaded wall, so the fake needs storage or
// its try/catch swallows the whole load and the test passes for the wrong reason.
// getPublicUrl serves the saved-preview lookup the same way.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/w1" } }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://public.example/wall-renders/${path}` },
        }),
      }),
    },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: getOptionalUserMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: resolveSubscriptionMock }));

import { GET } from "./route";

const VENUE = {
  slug: "the-copper-kettle",
  name: "The Copper Kettle",
  type: "cafe",
  city: "Hampton",
  location: "Hampton",
  user_id: "u-venue",
  postcode: "TW12 2TH",
};

const WALL = {
  id: "w1",
  name: "Front room",
  width_cm: 300,
  height_cm: 240,
  kind: "uploaded",
  wall_color_hex: "#ffffff",
  source_image_path: "walls/u-venue/front-room.jpg",
  is_public_on_profile: true,
};

/** Table router: venue lookup, walls, artwork requests, saved previews. */
function installDb(walls: unknown[], extra: Record<string, unknown[]> = {}) {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in", "is", "gte"]) chain[m] = () => chain;
    if (table === "venue_profiles") {
      chain.maybeSingle = async () => ({ data: VENUE, error: null });
      chain.single = async () => ({ data: VENUE, error: null });
      return chain;
    }
    const rows = table === "walls" ? walls : (extra[table] ?? []);
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  });
}

function req(): Request {
  return new Request("http://localhost/api/venues/the-copper-kettle/profile");
}

const ctx = { params: Promise.resolve({ slug: "the-copper-kettle" }) };

beforeEach(() => {
  fromMock.mockReset();
  isFlagOnMock.mockReset();
  getOptionalUserMock.mockReset();
  resolveSubscriptionMock.mockReset();

  installDb([WALL]);
  isFlagOnMock.mockReturnValue(true);
  // The venue's own owner, so the paywall is not what is under test here.
  getOptionalUserMock.mockResolvedValue({ user: { id: "u-venue", user_metadata: {} } });
  resolveSubscriptionMock.mockResolvedValue({ active: true });
});

describe("GET /api/venues/[slug]/profile honours the wall kill-switch (D6 item 3)", () => {
  it("serves walls while WALL_VISUALIZER_V1 is on", async () => {
    const body = await (await GET(req(), ctx)).json();
    expect(body.locked).toBe(false);
    expect(body.walls).toHaveLength(1);
    // The uploaded wall's storage path is signed into a URL, which is exactly
    // the data the kill-switch is supposed to be able to stop.
    expect(body.walls[0].source_image_url).toBe("https://signed.example/w1");
  });

  it("serves NO walls once the flag is off", async () => {
    // THE regression. This used to return the wall list regardless, so the
    // kill-switch disabled the UI and left the data flowing.
    isFlagOnMock.mockReturnValue(false);

    const body = await (await GET(req(), ctx)).json();

    expect(body.locked).toBe(false);
    expect(body.walls).toEqual([]);
  });

  it("does not even query the walls table once the flag is off", async () => {
    // Not returning them is the requirement; not reading them is the proof that
    // the gate is before the read rather than a filter after it.
    isFlagOnMock.mockReturnValue(false);

    await GET(req(), ctx);

    expect(fromMock.mock.calls.map((c) => c[0])).not.toContain("walls");
  });

  it("checks the wall flag specifically, not some other flag", async () => {
    await GET(req(), ctx);
    expect(isFlagOnMock).toHaveBeenCalledWith("WALL_VISUALIZER_V1");
  });

  it("still serves the rest of the profile with walls disabled", async () => {
    // The kill-switch turns off one feature, not the venue page.
    isFlagOnMock.mockReturnValue(false);

    const body = await (await GET(req(), ctx)).json();

    expect(body.venue.slug).toBe("the-copper-kettle");
    expect(body.venue.name).toBe("The Copper Kettle");
    expect(body.openRequests).toEqual([]);
  });

  it("never leaks the owner's user_id or exact postcode, flag either way", async () => {
    for (const flag of [true, false]) {
      isFlagOnMock.mockReturnValue(flag);
      const body = await (await GET(req(), ctx)).json();
      expect(body.venue, String(flag)).not.toHaveProperty("user_id");
      expect(body.venue, String(flag)).not.toHaveProperty("postcode");
    }
  });
});

describe("GET /api/venues/[slug]/profile carries the wall's saved preview", () => {
  it("attaches preview_image_url from the layout's last render", async () => {
    installDb([WALL], {
      wall_layouts: [
        { wall_id: "w1", last_render_id: "r1", updated_at: "2026-09-03T10:00:00Z" },
      ],
      wall_renders: [{ id: "r1", output_path: "u-venue/r1.webp" }],
    });

    const body = await (await GET(req(), ctx)).json();

    expect(body.walls[0].preview_image_url).toBe(
      "https://public.example/wall-renders/u-venue/r1.webp",
    );
    // The photo is still there for the card's fallback.
    expect(body.walls[0].source_image_url).toBe("https://signed.example/w1");
  });

  it("omits preview_image_url when the venue has never saved a preview", async () => {
    installDb([WALL]);
    const body = await (await GET(req(), ctx)).json();
    expect(body.walls[0]).not.toHaveProperty("preview_image_url");
  });

  it("only looks up previews for the public walls it is about to serve", async () => {
    installDb([WALL]);
    await GET(req(), ctx);
    // Layout lookups happen after the walls query, never before it, so a
    // private wall's preview can't be fetched and leak by another path.
    const tables = fromMock.mock.calls.map((c) => c[0]);
    expect(tables.indexOf("wall_layouts")).toBeGreaterThan(tables.indexOf("walls"));
  });
});
