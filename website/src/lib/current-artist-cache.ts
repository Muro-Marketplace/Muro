import type { DbArtistProfile, DbArtistWork } from "@/lib/db/artist-profiles-transform";

/**
 * The per-tab snapshot useCurrentArtist seeds a portal page from, so moving
 * between portal pages does not wait on a cold /api/artist-profile round trip.
 *
 * It is a warm start, not a source of truth. The portfolio page seeds its
 * works from the FIRST value the hook hands out and ignores the refresh that
 * follows, so a snapshot taken before this tab's own write shows the artist
 * the pre-save copy for up to the TTL. Owner report, 5 September 2026: a
 * quantity cleared to unlimited "did not save" and still read 0 on return.
 * Two rules keep the snapshot honest:
 *
 *   1. Every confirmed write drops it (mutate() in lib/api-client.ts).
 *   2. A refresh that was in flight when a write landed must not put the
 *      pre-write copy back: read `currentArtistCacheGeneration()` before the
 *      fetch and skip the write-back if it has moved since.
 *
 * Server-side changes (a sale decrementing stock, a placement approved) are
 * not covered: the next mount still refreshes in the background, but a page
 * that seeds once can be up to the TTL behind them.
 */
export interface CurrentArtistSnapshot {
  profile: DbArtistProfile;
  works: DbArtistWork[];
  ts: number;
}

const KEY_PREFIX = "wallplace-artist-";

export const CURRENT_ARTIST_CACHE_TTL_MS = 5 * 60 * 1000;

let generation = 0;

/** Moves on every clear. Compare before and after an async refresh. */
export function currentArtistCacheGeneration(): number {
  return generation;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    // Some privacy modes throw on the accessor itself.
    return null;
  }
}

export function readCurrentArtistCache(
  userId: string,
  now: number = Date.now(),
): CurrentArtistSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CurrentArtistSnapshot> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.profile || typeof parsed.ts !== "number") {
      return null;
    }
    if (now - parsed.ts >= CURRENT_ARTIST_CACHE_TTL_MS) return null;
    return {
      profile: parsed.profile,
      works: Array.isArray(parsed.works) ? parsed.works : [],
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function writeCurrentArtistCache(
  userId: string,
  snapshot: { profile: DbArtistProfile; works: DbArtistWork[] },
  now: number = Date.now(),
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      KEY_PREFIX + userId,
      JSON.stringify({ profile: snapshot.profile, works: snapshot.works, ts: now }),
    );
  } catch {
    // Quota or disabled storage: the next mount just fetches.
  }
}

/** Drop every artist snapshot in this tab. Safe to call where there is none. */
export function clearCurrentArtistCache(): void {
  generation += 1;
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && key.startsWith(KEY_PREFIX)) store.removeItem(key);
    }
  } catch {
    // Nothing to drop.
  }
}
