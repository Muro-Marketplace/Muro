// The one rule every artist-facing wall read shares: the wall must belong to
// the venue at the slug AND be public, else it reads as missing. The photo is
// served through a signed URL, never as its storage path.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the test passes its own client");
  },
}));

import {
  findPublicVenueWall,
  signWallPhotoUrl,
  toPublicVenueWall,
} from "./public-walls";
import type { Wall } from "@/lib/visualizer/types";

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
} satisfies Wall;

interface Fake {
  venue?: { user_id: string | null; slug: string; name: string | null } | null;
  venueError?: string;
  wall?: Record<string, unknown> | null;
  signed?: string | null;
  signThrows?: boolean;
}

function fakeClient(fake: Fake) {
  const tables: string[] = [];
  const client = {
    from: (table: string) => {
      tables.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => {
        if (table === "venue_profiles") {
          return fake.venueError
            ? { data: null, error: { message: fake.venueError } }
            : { data: fake.venue ?? null, error: null };
        }
        if (table === "walls") return { data: fake.wall ?? null, error: null };
        return { data: null, error: null };
      };
      return chain;
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          if (fake.signThrows) throw new Error("storage down");
          return fake.signed
            ? { data: { signedUrl: fake.signed }, error: null }
            : { data: null, error: { message: "no object" } };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

const VENUE = { user_id: "u-venue", slug: "copper-kettle", name: "The Copper Kettle" };

describe("signWallPhotoUrl", () => {
  it("returns null for a missing path without touching storage", async () => {
    const { client } = fakeClient({ signed: "https://signed.example/x" });
    expect(await signWallPhotoUrl(client, null)).toBeNull();
    expect(await signWallPhotoUrl(client, "")).toBeNull();
  });

  it("returns the signed URL, and null when signing fails or throws", async () => {
    expect(await signWallPhotoUrl(fakeClient({ signed: "https://signed.example/x" }).client, "p"))
      .toBe("https://signed.example/x");
    expect(await signWallPhotoUrl(fakeClient({ signed: null }).client, "p")).toBeNull();
    expect(await signWallPhotoUrl(fakeClient({ signThrows: true }).client, "p")).toBeNull();
  });
});

describe("findPublicVenueWall", () => {
  it("returns the wall when it is the venue's and public", async () => {
    const { client } = fakeClient({ venue: VENUE, wall: WALL });
    const found = await findPublicVenueWall("copper-kettle", "w1", client);
    expect(found?.wall.id).toBe("w1");
    expect(found?.venue).toEqual(VENUE);
  });

  it("is null for an unknown slug, and never reads the wall", async () => {
    const { client, tables } = fakeClient({ venue: null, wall: WALL });
    expect(await findPublicVenueWall("nobody", "w1", client)).toBeNull();
    expect(tables).toEqual(["venue_profiles"]);
  });

  it("is null when the venue lookup errors, rather than falling through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ venueError: "connection reset", wall: WALL });
    expect(await findPublicVenueWall("copper-kettle", "w1", client)).toBeNull();
    warn.mockRestore();
  });

  it("is null for a private wall", async () => {
    const { client } = fakeClient({ venue: VENUE, wall: { ...WALL, is_public_on_profile: false } });
    expect(await findPublicVenueWall("copper-kettle", "w1", client)).toBeNull();
  });

  it("is null for another venue's wall, even a public one", async () => {
    const { client } = fakeClient({ venue: VENUE, wall: { ...WALL, user_id: "u-other" } });
    expect(await findPublicVenueWall("copper-kettle", "w1", client)).toBeNull();
  });

  it("is null for a venue row with no linked user", async () => {
    const { client } = fakeClient({ venue: { ...VENUE, user_id: null }, wall: WALL });
    expect(await findPublicVenueWall("copper-kettle", "w1", client)).toBeNull();
  });

  it("is null for blank inputs without querying", async () => {
    const { client, tables } = fakeClient({ venue: VENUE, wall: WALL });
    expect(await findPublicVenueWall("", "w1", client)).toBeNull();
    expect(await findPublicVenueWall("copper-kettle", "", client)).toBeNull();
    expect(tables).toEqual([]);
  });
});

describe("toPublicVenueWall", () => {
  it("signs the photo of an uploaded wall and never exposes the owner or the storage path", async () => {
    const { client } = fakeClient({ signed: "https://signed.example/front" });
    const out = await toPublicVenueWall(WALL, client);
    expect(out).toEqual({
      id: "w1",
      name: "Front room",
      width_cm: 300,
      height_cm: 240,
      kind: "uploaded",
      preset_id: null,
      wall_color_hex: "F5F1EB",
      source_image_url: "https://signed.example/front",
    });
    expect("user_id" in out).toBe(false);
    expect("source_image_path" in out).toBe(false);
  });

  it("omits the URL when signing fails", async () => {
    const { client } = fakeClient({ signed: null });
    const out = await toPublicVenueWall(WALL, client);
    expect(out.source_image_url).toBeUndefined();
  });

  it("does not touch storage for a preset wall", async () => {
    const { client } = fakeClient({ signThrows: true });
    const out = await toPublicVenueWall(
      { ...WALL, kind: "preset", preset_id: "minimal_white", source_image_path: null },
      client,
    );
    expect(out.preset_id).toBe("minimal_white");
    expect(out.source_image_url).toBeUndefined();
  });
});
