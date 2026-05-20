// URL <-> location filter mapping for the /browse page.
//
// Plan C Task 8 (#2.8): the location filter (postcode coords + max
// distance) lived in component state, so switching between Galleries /
// Portfolios / Collections via the URL `view` param wiped it. Moving
// the filter into the URL lets the view-switch links preserve it
// alongside `view`, and gives back/forward + deep links for free.
//
// The schema is split per dimension so the URL stays human-readable:
//   loc_lat     — latitude (required for any non-anywhere mode)
//   loc_lng     — longitude
//   loc_label   — UI string, e.g. "EC1A 1BB" or "Current location"
//   maxDistance — miles (omitted from URL when it equals DEFAULT_MAX_DISTANCE)
//
// The mode in the plan's snippet ("anywhere" | "postcode" | "geo") is
// *inferred* from presence of params, rather than encoded explicitly:
// no lat/lng → anywhere; lat/lng with a UK-postcode-shaped label →
// postcode; lat/lng with any other label → geo. Inferring keeps the
// URL minimal and dodges the param-drift problem where the mode and
// the coords get out of sync.
//
// This module is pure — no React, no router. Exposes parse +
// serialize so the page component can drive both directions, and so
// the unit tests don't have to mock useSearchParams.

/** Default distance in miles, used when no `maxDistance` param is set. */
export const DEFAULT_MAX_DISTANCE = 25;

/** Sentinel "any distance" value, mirrors the slider's right-edge. */
export const ANY_DISTANCE = 9999;

export type ParsedLocation = {
  /** Coordinates if a location is set, null if "anywhere". */
  coords: { lat: number; lng: number } | null;
  /** UI label, "" when no location is set. */
  label: string;
  /** Max distance in miles. Always returns a sane number, even if
   *  the URL value was missing or malformed. */
  maxDistance: number;
};

/** Minimal subset of URLSearchParams the parse function needs. We
 *  accept anything with a `.get(key)` method so it works equally
 *  with the read-only ReadonlyURLSearchParams returned by
 *  `useSearchParams` and a plain URLSearchParams. */
export interface SearchParamsLike {
  get(name: string): string | null;
}

/** Read the location filter shape out of the current URL params. */
export function parseLocationParams(sp: SearchParamsLike | null | undefined): ParsedLocation {
  if (!sp) {
    return { coords: null, label: "", maxDistance: DEFAULT_MAX_DISTANCE };
  }
  const latRaw = sp.get("loc_lat");
  const lngRaw = sp.get("loc_lng");
  const label = sp.get("loc_label") ?? "";
  const maxRaw = sp.get("maxDistance");

  // Parse coords, both must be finite numbers for the location to
  // count as set. A half-set pair (one missing or NaN) is treated as
  // "anywhere" so we don't crash if a user lands on a malformed URL.
  let coords: { lat: number; lng: number } | null = null;
  if (latRaw !== null && lngRaw !== null) {
    const lat = Number.parseFloat(latRaw);
    const lng = Number.parseFloat(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      coords = { lat, lng };
    }
  }

  // maxDistance: parse if present, otherwise default. Negative or
  // non-finite values fall back to the default so the slider doesn't
  // go below 0 or render NaN.
  let maxDistance = DEFAULT_MAX_DISTANCE;
  if (maxRaw !== null) {
    const n = Number.parseInt(maxRaw, 10);
    if (Number.isFinite(n) && n >= 0) {
      maxDistance = n;
    }
  }

  return {
    coords,
    label: coords ? label : "",
    maxDistance,
  };
}

/** Build a new URLSearchParams that merges the desired location into
 *  `currentParams`, preserving any non-location keys (e.g. `view`).
 *  Returns a copy — does not mutate the input. */
export function serializeLocationParams(
  next: ParsedLocation,
  currentParams: URLSearchParams,
): URLSearchParams {
  const out = new URLSearchParams(currentParams.toString());

  if (!next.coords) {
    // "Anywhere" — drop every location key so the URL stays clean.
    out.delete("loc_lat");
    out.delete("loc_lng");
    out.delete("loc_label");
    out.delete("maxDistance");
    return out;
  }

  out.set("loc_lat", next.coords.lat.toString());
  out.set("loc_lng", next.coords.lng.toString());
  if (next.label) {
    out.set("loc_label", next.label);
  } else {
    out.delete("loc_label");
  }
  // Only write maxDistance when it differs from the default, keeps
  // the URL short for the common case (just `?loc_lat=...&loc_lng=...`).
  if (next.maxDistance !== DEFAULT_MAX_DISTANCE) {
    out.set("maxDistance", next.maxDistance.toString());
  } else {
    out.delete("maxDistance");
  }
  return out;
}
