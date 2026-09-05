"use client";

import { authFetch } from "@/lib/api-client";
import type { DbArtistProfile, DbArtistWork } from "@/lib/db/artist-profiles-transform";
import {
  currentArtistCacheGeneration,
  readCurrentArtistCache,
  writeCurrentArtistCache,
} from "@/lib/current-artist-cache";

/**
 * One /api/artist-profile read, shared by everything in the artist portal.
 *
 * Four separate consumers used to call the endpoint independently, so a single
 * navigation to /artist-portal/portfolio sent four identical requests:
 * PortalGuard (for review_status and subscription_status), ArtistPortalLayout
 * (for the profile's existence and the avatar), useCurrentArtist, and the
 * portfolio page again for `default_shipping_price`, a field already sitting in
 * the payload the hook above it had just fetched. Each response carries the
 * profile row plus EVERY artist_works row, so the artist re-downloaded their
 * whole portfolio four times per click.
 *
 * Moving the chrome into the route layout stopped the per-click repeat. This
 * collapses what is left: concurrent callers share one in-flight request, so
 * the portal's first load makes one call instead of four.
 *
 * Freshness is the existing contract from lib/current-artist-cache.ts:
 * `mutate()` drops the snapshot on every confirmed write and moves the
 * generation. A request issued before that write is not handed to callers that
 * arrive after it, and its result is not written back over the cleared
 * snapshot.
 */
export interface ArtistProfilePayload {
  profile: DbArtistProfile | null;
  works: DbArtistWork[];
}

let inflight: Promise<ArtistProfilePayload> | null = null;
let inflightGeneration = -1;
let inflightHasWorks = false;

/**
 * Fetch the profile, sharing one request between concurrent callers.
 *
 * `withWorks: false` asks the API for the profile row alone. The two chrome
 * callers (the layout wants the avatar and whether a row exists, PortalGuard
 * wants review_status and subscription_status) never look at the works, and one
 * of them blocks the portal's first paint; the works list is 30 columns a row.
 *
 * A request that carries works satisfies a caller that does not need them, so a
 * profile-only caller joins whatever is already out. The reverse is not true: a
 * works caller will not take a profile-only response and issues its own. On a
 * page that uses useCurrentArtist the page's effect runs before the layout's
 * (React runs effects child first), so the shared request is the one WITH works
 * and the chrome piggybacks on it. If that order ever changed the cost would be
 * one extra request, never wrong data.
 *
 * Rejects when the request could not be completed. A resolved `profile: null`
 * means the account genuinely has no artist_profiles row (it has never
 * applied). The two must stay distinguishable: LA-C046 was a failed check being
 * read as "no profile", which sent approved artists to the application form.
 *
 * `userId` only names the snapshot slot. Pass the signed-in auth user's id.
 */
export function fetchArtistProfileShared(
  userId: string,
  { withWorks = true }: { withWorks?: boolean } = {},
): Promise<ArtistProfilePayload> {
  const generation = currentArtistCacheGeneration();
  if (inflight && inflightGeneration === generation && (inflightHasWorks || !withWorks)) {
    return inflight;
  }

  inflightGeneration = generation;
  inflightHasWorks = withWorks;
  const request = authFetch(withWorks ? "/api/artist-profile" : "/api/artist-profile?works=0")
    .then(async (res) => {
      if (!res.ok) throw new Error(`profile check failed (${res.status})`);
      const data = (await res.json()) as { profile?: DbArtistProfile; works?: DbArtistWork[] };
      const payload: ArtistProfilePayload = {
        profile: data.profile ?? null,
        works: data.works ?? [],
      };
      // Only a response that actually carries the works may seed the snapshot.
      // Writing a profile-only one would hand the next portal page an artist
      // with an empty portfolio.
      if (withWorks && payload.profile && currentArtistCacheGeneration() === generation) {
        writeCurrentArtistCache(userId, { profile: payload.profile, works: payload.works });
      }
      return payload;
    })
    .finally(() => {
      // Free the slot so the next mount fetches again, but only if this is
      // still the request being shared.
      if (inflight === request) inflight = null;
    });

  inflight = request;
  return request;
}

/** A warm snapshot for this user, or null. Never makes a request. */
export function peekArtistProfile(userId: string): ArtistProfilePayload | null {
  const cached = readCurrentArtistCache(userId);
  return cached ? { profile: cached.profile, works: cached.works } : null;
}

/** Test seam: forget the shared in-flight request. */
export function resetArtistProfileSharedForTests(): void {
  inflight = null;
  inflightGeneration = -1;
  inflightHasWorks = false;
}
