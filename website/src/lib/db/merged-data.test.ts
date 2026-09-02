import { afterEach, describe, expect, it, vi } from "vitest";

// Launch audit, blocker 1, as scoped by the owner on 2 September: the seed
// catalogue is fictional, so one flag must be able to remove it everywhere,
// and every seed row must say it is one (isSeedArtist) so the Sample pill
// can find it. Nothing else about a seed row changes.
vi.mock("@/data/artists", () => ({
  artists: [{ slug: "seed-one", name: "Seed One", isVerified: true, works: [] }],
}));
vi.mock("./artist-profiles", () => ({
  getAllDatabaseArtists: vi.fn(async () => [
    { slug: "real-one", name: "Real One", isVerified: true, subscriptionStatus: "active", works: [] },
  ]),
  getArtistProfileBySlug: vi.fn(async () => null),
  dbProfileToArtist: vi.fn(),
}));

import { getAllArtists, getArtistBySlug } from "./merged-data";

function setNodeEnv(value: string): void {
  (process.env as Record<string, string>).NODE_ENV = value;
}

describe("seed catalogue gating", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("hides seed artists when the flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    setNodeEnv("production");
    const all = await getAllArtists();
    expect(all.map((a) => a.slug)).toEqual(["real-one"]);
    expect(await getArtistBySlug("seed-one")).toBeNull();
  });

  it("shows seed artists by default in production, each marked as seed", async () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    setNodeEnv("production");
    const seed = (await getAllArtists()).find((a) => a.slug === "seed-one");
    expect(seed?.isSeedArtist).toBe(true);
    expect((await getArtistBySlug("seed-one"))?.isSeedArtist).toBe(true);
  });
});
