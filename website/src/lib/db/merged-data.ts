import { artists as staticArtists } from "@/data/artists";
import type { Artist } from "@/data/artists";
import { getAllDatabaseArtists, getArtistProfileBySlug, dbProfileToArtist } from "./artist-profiles";

/**
 * Returns all artists: static seed data + database artists.
 * Database artists override static if same slug exists.
 */
export async function getAllArtists(): Promise<Artist[]> {
  const dbArtists = await getAllDatabaseArtists();
  const dbSlugs = new Set(dbArtists.map((a) => a.slug));

  // Static artists that aren't overridden by database entries.
  // Plan F #12: hand-curated seed artists are verified by definition,
  // dbProfileToArtist sets isVerified for DB rows, so we backfill it
  // here for the static slice.
  const staticOnly = staticArtists
    .filter((a) => !dbSlugs.has(a.slug))
    .map((a) => ({ ...a, isVerified: a.isVerified ?? true }));

  return [...dbArtists, ...staticOnly];
}

/**
 * Get a single artist by slug, database first, then static fallback.
 */
export async function getArtistBySlug(slug: string): Promise<Artist | null> {
  // Try database first
  const dbResult = await getArtistProfileBySlug(slug);
  if (dbResult) {
    return dbProfileToArtist(dbResult.profile, dbResult.works);
  }

  // Fall back to static data — same isVerified backfill as getAllArtists.
  const staticArtist = staticArtists.find((a) => a.slug === slug);
  if (!staticArtist) return null;
  return { ...staticArtist, isVerified: staticArtist.isVerified ?? true };
}
