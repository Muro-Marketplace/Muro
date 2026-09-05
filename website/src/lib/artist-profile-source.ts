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

/**
 * Fetch the profile, sharing one request between concurrent callers.
 *
 * Rejects when the request could not be completed. A resolved `profile: null`
 * means the account genuinely has no artist_profiles row (it has never
 * applied). The two must stay distinguishable: LA-C046 was a failed check being
 * read as "no profile", which sent approved artists to the application form.
 *
 * `userId` only names the snapshot slot. Pass the signed-in auth user's id.
 */
export function fetchArtistProfileShared(userId: string): Promise<ArtistProfilePayload> {
  const generation = currentArtistCacheGeneration();
  if (inflight && inflightGeneration === generation) return inflight;

  inflightGeneration = generation;
  const request = authFetch("/api/artist-profile")
    .then(async (res) => {
      if (!res.ok) throw new Error(`profile check failed (${res.status})`);
      const data = (await res.json()) as { profile?: DbArtistProfile; works?: DbArtistWork[] };
      const payload: ArtistProfilePayload = {
        profile: data.profile ?? null,
        works: data.works ?? [],
      };
      if (payload.profile && currentArtistCacheGeneration() === generation) {
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
}
