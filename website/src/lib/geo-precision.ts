// Coordinate precision for anything published to an unentitled viewer.
//
// One implementation, shared by the artist feed (Bug 1) and the venue demand
// tracker (Bug 5), so the two cannot drift apart.

/**
 * Decimal places kept on published coordinates.
 *
 * 2, not the "~1 decimal" D8 offers as an example. Both surfaces filter by
 * distance client-side and their smallest radius is 5 miles (~8km); 1dp quantises
 * latitude to ~11km, larger than the filter itself, which would silently break
 * local search. At 2dp the worst-case error is ~0.55km on latitude and less on
 * longitude at UK latitudes: enough to stop being a street address, small enough
 * that a 5-mile filter still means something.
 */
export const PUBLIC_COORD_DECIMALS = 2;

const FACTOR = 10 ** PUBLIC_COORD_DECIMALS;

export interface Coordinates {
  lat: number;
  lng: number;
}

const coarsen = (value: number): number => Math.round(value * FACTOR) / FACTOR;

/** Reduce a fix to publishable precision. Returns null unchanged. */
export function coarsenCoordinates(coords: Coordinates | null | undefined): Coordinates | null {
  if (!coords) return null;
  return { lat: coarsen(coords.lat), lng: coarsen(coords.lng) };
}
