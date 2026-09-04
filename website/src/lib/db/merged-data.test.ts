import { afterEach, describe, expect, it, vi } from "vitest";

// Launch audit, blocker 1, as scoped by the owner on 2 September: the seed
// catalogue is fictional, so one flag must be able to remove it everywhere,
// and every seed row must say it is one (isSeedArtist) so the Sample pill
// can find it. Nothing else about a seed row changes.
vi.mock("@/data/artists", () => ({
  artists: [{ slug: "seed-one", name: "Seed One", isVerified: true, works: [] }],
}));
// Slugs the stubbed `artist_profiles` table holds. `real-one` is the DB
// artist; `seed-one` above is the seed-catalogue one, and deliberately is NOT
// in here, so the seed fallback is what resolves it.
const DB_SLUGS = new Set(["real-one"]);

vi.mock("./artist-profiles", () => ({
  getAllDatabaseArtists: vi.fn(async () => [
    { slug: "real-one", name: "Real One", isVerified: true, subscriptionStatus: "active", works: [] },
  ]),
  getArtistProfileBySlug: vi.fn(async (slug: string) =>
    DB_SLUGS.has(slug) ? { profile: { slug }, works: [] } : null,
  ),
  artistProfileSlugExists: vi.fn(async (slug: string) => DB_SLUGS.has(slug)),
  dbProfileToArtist: vi.fn((profile: { slug: string }) => ({
    slug: profile.slug,
    name: "Real One",
    isVerified: true,
    works: [],
  })),
}));

import { artistSlugExists, getAllArtists, getArtistBySlug } from "./merged-data";

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

// The vanity URL at `/{slug}` redirects to `/browse/{slug}` when the slug
// belongs to an artist and 404s when it does not. It answers that with
// artistSlugExists rather than getArtistBySlug, to avoid paying for the whole
// profile plus every work on a catch-all route that also fields every mistyped
// URL on the site.
//
// Two cheap resolvers over one question is how they drift, and a drift here is
// visible to the public: `/{slug}` 404s while `/browse/{slug}` renders the
// page, which is the exact inconsistency the vanity route exists to remove. So
// the contract under test is agreement, not correctness in isolation.
describe("artistSlugExists() agrees with getArtistBySlug()", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  async function bothAnswers(slug: string): Promise<{ exists: boolean; resolves: boolean }> {
    return {
      exists: await artistSlugExists(slug),
      resolves: (await getArtistBySlug(slug)) !== null,
    };
  }

  it("agrees on a live database slug", async () => {
    setNodeEnv("production");
    const { exists, resolves } = await bothAnswers("real-one");
    expect(exists).toBe(true);
    expect(exists).toBe(resolves);
  });

  it("agrees on a seed-catalogue slug while the flag is on", async () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    setNodeEnv("production");
    const { exists, resolves } = await bothAnswers("seed-one");
    expect(exists).toBe(true);
    expect(exists).toBe(resolves);
  });

  it("agrees on the same seed slug once the flag is off", async () => {
    // The failure this catches: a helper that reads artist_profiles only would
    // say false here AND false above, 404ing a seed artist's vanity URL while
    // /browse/seed-one still rendered their page.
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    setNodeEnv("production");
    const { exists, resolves } = await bothAnswers("seed-one");
    expect(exists).toBe(false);
    expect(exists).toBe(resolves);
  });

  it("agrees on an unknown slug", async () => {
    setNodeEnv("production");
    const { exists, resolves } = await bothAnswers("no-such-artist");
    expect(exists).toBe(false);
    expect(exists).toBe(resolves);
  });
});
