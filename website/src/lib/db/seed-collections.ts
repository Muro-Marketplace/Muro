/**
 * The seed catalogue's collections.
 *
 * Artists have had a seed slice since the start: `merged-data.ts` appends the
 * hand-written artists from `@/data/artists` behind the SEED_CATALOG flag and
 * tags them `isSeedArtist`, which is what puts the Sample pill on their cards.
 * Collections had `export const collections = []` and a route comment saying
 * "collections are created by artists only", so /browse?view=collections was
 * empty on a marketplace whose artist grid was full.
 *
 * This is the same treatment, for the same reason and behind the same flag. A
 * real collection always wins over a sample sharing its id, and every sample
 * carries `isSeedCollection` out of here so nothing can render one as if it
 * were a real listing.
 *
 * Pure and synchronous: the seed catalogue is a compiled-in array, so this
 * touches no database and can be called from anywhere.
 */

import { artists as staticArtists } from "@/data/artists";
import type { ArtistWork } from "@/data/artists";
import { collections as seedCollections } from "@/data/collections";
import type { ArtistCollection } from "@/data/collections";
import { isFlagOn } from "@/lib/feature-flags";
import { cheapestTier } from "@/lib/collection-tiers";

/** A seed work resolved for display, matching what /api/collections/[id] returns. */
export type ResolvedSeedWork = ArtistWork & {
  selectedSize?: string;
  selectedSizePrice?: number;
};

/**
 * Tag it, and give it the same shape the database path returns.
 *
 * The seed catalogue is hand-written, so an untiered entry simply omits
 * `sizeTiers`, while /api/collections/[id] always answers with an array. A
 * consumer should not have to know which source it is reading, so the array
 * is filled in here rather than repeated across the data.
 */
function markSeed(collection: ArtistCollection): ArtistCollection {
  return {
    ...collection,
    sizeTiers: collection.sizeTiers ?? [],
    workSizes: collection.workSizes ?? [],
    isSeedCollection: true,
  };
}

/**
 * The real collections, then the samples that do not collide with one.
 *
 * Ordering matters: real listings come first so the browse grid leads with
 * them, exactly as `getAllArtists` puts database artists before seed ones.
 */
export function withSeedCollections(
  dbCollections: ArtistCollection[],
): ArtistCollection[] {
  if (!isFlagOn("SEED_CATALOG")) return dbCollections;
  const taken = new Set(dbCollections.map((c) => c.id));
  return [
    ...dbCollections,
    ...seedCollections.filter((c) => !taken.has(c.id)).map(markSeed),
  ];
}

/**
 * One sample collection by id, for the detail page's fallback when the
 * database has no such row. Returns undefined when the flag is off, so a
 * hidden catalogue stays hidden on the detail route too rather than being
 * reachable by guessing a URL.
 */
export function getSeedCollection(id: string): ArtistCollection | undefined {
  if (!isFlagOn("SEED_CATALOG")) return undefined;
  const found = seedCollections.find((c) => c.id === id);
  return found ? markSeed(found) : undefined;
}

/**
 * Resolve a sample collection's works out of the seed artist that owns them,
 * with each work's size and price set from the collection's default view.
 *
 * The default is the cheapest tier, matching `/api/collections/[id]`, so the
 * page's first paint agrees with the tier its picker opens on. A work id the
 * artist does not have is dropped rather than left as a hole, and a pinned
 * size the work no longer sells falls back to its first size, both the same
 * way the database path behaves.
 */
export function resolveSeedCollectionWorks(collection: ArtistCollection): {
  works: ResolvedSeedWork[];
  artistName: string;
} {
  const artist = staticArtists.find((a) => a.slug === collection.artistSlug);
  if (!artist) return { works: [], artistName: "" };

  const defaultTier = cheapestTier(collection.sizeTiers);
  const defaultSizes = defaultTier ? defaultTier.workSizes : collection.workSizes ?? [];
  const sizeByWork = new Map(defaultSizes.map((ws) => [ws.workId, ws.sizeLabel] as const));

  const works: ResolvedSeedWork[] = [];
  for (const id of collection.workIds) {
    const work = artist.works.find((w) => w.id === id);
    if (!work) continue;
    const pinned = sizeByWork.get(id);
    const pricing = work.pricing || [];
    const entry =
      (pinned ? pricing.find((p) => p.label === pinned) : undefined) ?? pricing[0];
    works.push({
      ...work,
      selectedSize: entry?.label ?? pinned,
      selectedSizePrice: entry?.price,
    });
  }

  return { works, artistName: artist.name };
}
