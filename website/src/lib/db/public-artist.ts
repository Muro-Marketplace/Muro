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

/**
 * Decimal places kept on published coordinates.
 *
 * 2, not the "~1 decimal" D8 offers as an example. The browse page's smallest
 * radius option is 5 miles (~8km), and 1dp quantises latitude to ~11km, which is
 * larger than the filter itself, so it would silently break local search. At 2dp
 * the worst-case error is ~0.55km on latitude and less on longitude at UK
 * latitudes: enough to stop being a street address, small enough that a 5-mile
 * filter still means something.
 */
export const PUBLIC_COORD_DECIMALS = 2;

const FACTOR = 10 ** PUBLIC_COORD_DECIMALS;

const coarsen = (value: number): number => Math.round(value * FACTOR) / FACTOR;

interface Coordinates {
  lat: number;
  lng: number;
}

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
    coordinates: coordinates
      ? { lat: coarsen(coordinates.lat), lng: coarsen(coordinates.lng) }
      : null,
  };
}
