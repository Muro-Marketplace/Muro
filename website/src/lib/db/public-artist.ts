// Public projection for the anonymous artist feed (Bug 1 / G-A).
//
// /api/browse-artists is unauthenticated and returned each artist straight from
// the transform, which includes `postcode` and the `coordinates` geocoded from it.
// For a solo artist working from home that is their home address, published to
// anyone who curls the endpoint.
//
// Applied at the public route rather than in artist-profiles-transform.ts: the
// transform also serves the artist their OWN profile, where the postcode is theirs
// to see and is needed by the profile editor.

import {
  coarsenCoordinates,
  PUBLIC_COORD_DECIMALS,
  type Coordinates,
} from "@/lib/geo-precision";

// The precision rule has one definition, in geo-precision.ts, shared with the
// venue demand tracker so the two cannot drift. Re-exported here because callers
// and tests reason about it in terms of the artist feed.
export { PUBLIC_COORD_DECIMALS };

/**
 * Strip the postcode and coarsen the coordinates, leaving everything else the
 * browse page needs untouched. Does not mutate its argument.
 */
// The constraint is `object`, not `{ postcode?: ...; coordinates?: ... }`. Both of
// those properties are optional, which makes that a "weak type", and TypeScript
// then rejects an artist that happens to carry neither ("no properties in common").
// An artist with no location data is a legitimate input, so the shape is asserted
// inside instead of constraining callers.
export function toPublicArtist<T extends object>(
  artist: T,
): Omit<T, "postcode" | "coordinates"> & { coordinates: Coordinates | null } {
  const {
    postcode: _postcode,
    coordinates,
    ...rest
  } = artist as T & { postcode?: string | null; coordinates?: Coordinates | null };
  return {
    ...rest,
    coordinates: coarsenCoordinates(coordinates),
  };
}
