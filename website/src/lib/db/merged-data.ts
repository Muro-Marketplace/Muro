import { artists as staticArtists } from "@/data/artists";
import type { Artist } from "@/data/artists";
import {
  artistProfileSlugExists,
  getAllDatabaseArtists,
  getArtistProfileBySlug,
  dbProfileToArtist,
} from "./artist-profiles";
import { isFlagOn } from "@/lib/feature-flags";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Returns all artists: static seed data + database artists.
 * Database artists override static if same slug exists.
 *
 * Phase 2.5 B4: when GATING_V1 is on, DB artists must have an active
 * subscription to surface. Static seed-catalog entries always show
 * (they don't carry subscription_status; they're hand-curated for the
 * marketplace's first wave).
 */
export async function getAllArtists(): Promise<Artist[]> {
  const dbArtists = await getAllDatabaseArtists();
  const dbSlugs = new Set(dbArtists.map((a) => a.slug));

  // Static artists that aren't overridden by database entries.
  // Plan F #12: hand-curated seed artists are verified by definition,
  // dbProfileToArtist sets isVerified for DB rows, so we backfill it
  // here for the static slice.
  // Launch audit, blocker 1, scoped by the owner on 2 September. The seed
  // catalogue is fictional. It surfaces only while SEED_CATALOG is on (on
  // everywhere for now under decision D1; NEXT_PUBLIC_FLAG_SEED_CATALOG=0
  // hides it). isSeedArtist drives the Sample pill; nothing else changes.
  const staticOnly = isFlagOn("SEED_CATALOG")
    ? staticArtists
        .filter((a) => !dbSlugs.has(a.slug))
        .map((a) => ({ ...a, isVerified: a.isVerified ?? true, isSeedArtist: true }))
    : [];

  const merged = [...dbArtists, ...staticOnly];

  if (!isFlagOn("GATING_V1")) {
    return merged;
  }

  return merged.filter((a) => {
    if (a.isSeedArtist) return true;
    return ACTIVE_SUBSCRIPTION_STATUSES.has((a.subscriptionStatus ?? "").toLowerCase());
  });
}

/**
 * Get a single artist by slug, database first, then static fallback
 * (static only while SEED_CATALOG is on, and marked isSeedArtist).
 */
export async function getArtistBySlug(slug: string): Promise<Artist | null> {
  const dbResult = await getArtistProfileBySlug(slug);
  if (dbResult) {
    return dbProfileToArtist(dbResult.profile, dbResult.works);
  }
  if (!isFlagOn("SEED_CATALOG")) return null;
  const staticArtist = staticArtists.find((a) => a.slug === slug);
  if (!staticArtist) return null;
  return { ...staticArtist, isVerified: staticArtist.isVerified ?? true, isSeedArtist: true };
}

/**
 * Whether `slug` belongs to an artist, without loading the artist.
 *
 * Used by the vanity URL (`src/app/(pages)/[artistSlug]/page.tsx`) to decide
 * between a redirect to `/browse/{slug}` and a 404. That route is a catch-all,
 * so it fields every mistyped URL on the site as well as every real shop link,
 * and `getArtistBySlug` would make each of those a full profile read plus every
 * work plus a placements read.
 *
 * **This must resolve the same slugs as `getArtistBySlug` above**, seed
 * catalogue included. A version that checked only `artist_profiles` would 404
 * `/{seed-slug}` while `/browse/{seed-slug}` rendered the page, which is the
 * inconsistency the vanity route exists to remove. The two functions sit
 * adjacent for that reason, and `merged-data.test.ts` asserts they agree across
 * a database slug, a seed slug with SEED_CATALOG on, the same seed slug with it
 * off, and an unknown slug. Change one, and that test tells you about the other.
 */
export async function artistSlugExists(slug: string): Promise<boolean> {
  if (await artistProfileSlugExists(slug)) return true;
  if (!isFlagOn("SEED_CATALOG")) return false;
  return staticArtists.some((a) => a.slug === slug);
}
