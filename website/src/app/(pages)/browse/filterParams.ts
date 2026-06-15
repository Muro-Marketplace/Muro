// URL <-> sidebar-filter mapping for the /browse page (Bug 20).
//
// The browse page already syncs the *primary* filters to the URL
// (view / discipline / sub / q / featured) and the location filter
// (loc_lat / loc_lng / loc_label / maxDistance, see locationParams.ts).
// But the gallery + collections *refinement* filters in the sidebar
// lived in plain component state, so a user who set them then
// refreshed or shared the link lost every one. This module adds the
// same URL <-> state mapping for those refinement filters.
//
// Design contract (matches the existing locationParams.ts module and
// the page's architecture note about the slider-thumb lag bug):
//
//   * This module is PURE. No React, no router, no DOM. The page
//     component drives both directions and the unit tests don't have
//     to mock useSearchParams.
//   * State is the OWNER, the URL is a MIRROR. serializeFilters builds
//     the query the page writes via router.replace; parseFilters reads
//     it back ONCE on mount to hydrate state. After mount the URL never
//     drives a control's `value` every render, so the price/range
//     sliders keep their local-state value and never snap back (the
//     historical slider-lag bug, see DistanceSliderControl in page.tsx).
//   * Only NON-DEFAULT values are written, so the default filter set
//     produces an empty query and the URL stays clean & short.
//   * parseFilters is defensive: unknown params are ignored, numbers
//     are clamped to their valid range, the size Set drops junk bands.
//     A malformed deep link never crashes the page.
//
// Param names are short and stable (changing one breaks existing
// shared links), namespaced `g*` for gallery and `c*` for collections
// to avoid colliding with the primary-filter params above.

/** Size bands for the gallery size filter (mirrors the page's union). */
export type SizeBand = "small" | "medium" | "large" | "xl";

const SIZE_BANDS: readonly SizeBand[] = ["small", "medium", "large", "xl"];

/** Sort options, kept in sync with the page's useState unions. */
export type ArtistSort = "featured" | "name" | "revenue_share" | "distance";
export type GallerySort =
  | "featured"
  | "recent"
  | "az"
  | "price_low"
  | "price_high"
  | "revenue_share"
  | "distance";
export type LocationMode = "global" | "local";

const ARTIST_SORTS: readonly ArtistSort[] = [
  "featured",
  "name",
  "revenue_share",
  "distance",
];
const GALLERY_SORTS: readonly GallerySort[] = [
  "featured",
  "recent",
  "az",
  "price_low",
  "price_high",
  "revenue_share",
  "distance",
];
const LOCATION_MODES: readonly LocationMode[] = ["global", "local"];

/** The slice of /browse state this module owns. Field names and types
 *  mirror the page's useState declarations exactly so hydration can
 *  assign straight back. */
export interface BrowseFilterState {
  // sorts
  artistSort: ArtistSort;
  gallerySort: GallerySort;
  // gallery refinement filters
  galleryTheme: string;
  galleryMedium: string;
  galleryStyle: string;
  galleryAvailableOnly: boolean;
  galleryPriceMin: number;
  galleryPriceMax: number;
  galleryLocationMode: LocationMode;
  galleryOriginals: boolean;
  galleryPrints: boolean;
  galleryFraming: boolean;
  galleryFreeLoan: boolean;
  galleryRevenueShare: boolean;
  galleryRevenueShareMin: number;
  galleryPurchase: boolean;
  gallerySizes: Set<SizeBand>;
  // collections refinement filters
  collectionsLocationMode: LocationMode;
  collectionsPriceMin: number;
  collectionsPriceMax: number;
  collectionsFreeLoan: boolean;
  collectionsRevShare: boolean;
  collectionsPurchase: boolean;
}

// Price-slider ranges, copied from the page's <input type="range">
// min/max so parseFilters clamps deep-link values to the same window.
const GALLERY_PRICE_FLOOR = 0;
const GALLERY_PRICE_CEIL = 1000;
const COLLECTIONS_PRICE_FLOOR = 0;
const COLLECTIONS_PRICE_CEIL = 2000;
// Revenue-share % is a 0–100 slider.
const REV_SHARE_MIN = 0;
const REV_SHARE_MAX = 100;

/**
 * Defaults — these MUST match the page's initial useState values
 * exactly (see page.tsx ~lines 430-610). serializeFilters omits any
 * field still at its default so a pristine filter set yields an empty
 * query; parseFilters falls back to these for missing/garbage params.
 */
export const DEFAULTS: BrowseFilterState = {
  artistSort: "featured",
  gallerySort: "featured",
  galleryTheme: "",
  galleryMedium: "",
  galleryStyle: "",
  galleryAvailableOnly: false,
  galleryPriceMin: GALLERY_PRICE_FLOOR,
  galleryPriceMax: GALLERY_PRICE_CEIL,
  galleryLocationMode: "local",
  galleryOriginals: false,
  galleryPrints: false,
  galleryFraming: false,
  galleryFreeLoan: false,
  galleryRevenueShare: false,
  galleryRevenueShareMin: REV_SHARE_MIN,
  galleryPurchase: false,
  gallerySizes: new Set<SizeBand>(),
  collectionsLocationMode: "local",
  collectionsPriceMin: COLLECTIONS_PRICE_FLOOR,
  collectionsPriceMax: COLLECTIONS_PRICE_CEIL,
  collectionsFreeLoan: false,
  collectionsRevShare: false,
  collectionsPurchase: false,
};

/** Short, stable URL keys. Namespaced to dodge the primary-filter keys
 *  (view/discipline/sub/q/featured) and the loc_* keys. */
const KEYS = {
  artistSort: "asort",
  gallerySort: "gsort",
  galleryTheme: "gtheme",
  galleryMedium: "gmedium",
  galleryStyle: "gstyle",
  galleryAvailableOnly: "gavail",
  galleryPriceMin: "gpmin",
  galleryPriceMax: "gpmax",
  galleryLocationMode: "gloc",
  galleryOriginals: "gorig",
  galleryPrints: "gprints",
  galleryFraming: "gframe",
  galleryFreeLoan: "gloan",
  galleryRevenueShare: "grev",
  galleryRevenueShareMin: "grevmin",
  galleryPurchase: "gbuy",
  gallerySizes: "gsizes",
  collectionsLocationMode: "cloc",
  collectionsPriceMin: "cpmin",
  collectionsPriceMax: "cpmax",
  collectionsFreeLoan: "cloan",
  collectionsRevShare: "crev",
  collectionsPurchase: "cbuy",
} as const;

/** Every key this module manages, so the page can wipe the previous
 *  filter params before writing the new ones (keeps stale keys from
 *  lingering when a filter returns to its default). */
export const FILTER_PARAM_KEYS: readonly string[] = Object.values(KEYS);

/** Minimal read interface, matches the ReadonlyURLSearchParams from
 *  useSearchParams and a plain URLSearchParams. */
export interface SearchParamsLike {
  get(name: string): string | null;
}

/** Encode a boolean: present as "1" only when true. */
function setBool(out: URLSearchParams, key: string, value: boolean): void {
  if (value) out.set(key, "1");
}

/** Encode a number only when it differs from its default. */
function setNum(
  out: URLSearchParams,
  key: string,
  value: number,
  def: number,
): void {
  if (value !== def) out.set(key, String(value));
}

/** Encode a non-empty string only when it differs from its default. */
function setStr(
  out: URLSearchParams,
  key: string,
  value: string,
  def: string,
): void {
  if (value !== def) out.set(key, value);
}

/**
 * Build a fresh URLSearchParams holding ONLY the in-scope filter
 * params that differ from their defaults. Does not touch primary or
 * location params — the caller merges this into the live params.
 */
export function serializeFilters(state: BrowseFilterState): URLSearchParams {
  const out = new URLSearchParams();

  // sorts
  setStr(out, KEYS.artistSort, state.artistSort, DEFAULTS.artistSort);
  setStr(out, KEYS.gallerySort, state.gallerySort, DEFAULTS.gallerySort);

  // gallery selects / text
  setStr(out, KEYS.galleryTheme, state.galleryTheme, DEFAULTS.galleryTheme);
  setStr(out, KEYS.galleryMedium, state.galleryMedium, DEFAULTS.galleryMedium);
  setStr(out, KEYS.galleryStyle, state.galleryStyle, DEFAULTS.galleryStyle);

  // gallery booleans
  setBool(out, KEYS.galleryAvailableOnly, state.galleryAvailableOnly);
  setBool(out, KEYS.galleryOriginals, state.galleryOriginals);
  setBool(out, KEYS.galleryPrints, state.galleryPrints);
  setBool(out, KEYS.galleryFraming, state.galleryFraming);
  setBool(out, KEYS.galleryFreeLoan, state.galleryFreeLoan);
  setBool(out, KEYS.galleryRevenueShare, state.galleryRevenueShare);
  setBool(out, KEYS.galleryPurchase, state.galleryPurchase);

  // gallery numbers
  setNum(out, KEYS.galleryPriceMin, state.galleryPriceMin, DEFAULTS.galleryPriceMin);
  setNum(out, KEYS.galleryPriceMax, state.galleryPriceMax, DEFAULTS.galleryPriceMax);
  setNum(
    out,
    KEYS.galleryRevenueShareMin,
    state.galleryRevenueShareMin,
    DEFAULTS.galleryRevenueShareMin,
  );

  // gallery location mode (only when it leaves the default)
  setStr(
    out,
    KEYS.galleryLocationMode,
    state.galleryLocationMode,
    DEFAULTS.galleryLocationMode,
  );

  // gallery sizes — stable sorted comma list, omitted when empty
  if (state.gallerySizes.size > 0) {
    const sorted = SIZE_BANDS.filter((b) => state.gallerySizes.has(b));
    if (sorted.length > 0) out.set(KEYS.gallerySizes, sorted.join(","));
  }

  // collections
  setStr(
    out,
    KEYS.collectionsLocationMode,
    state.collectionsLocationMode,
    DEFAULTS.collectionsLocationMode,
  );
  setNum(
    out,
    KEYS.collectionsPriceMin,
    state.collectionsPriceMin,
    DEFAULTS.collectionsPriceMin,
  );
  setNum(
    out,
    KEYS.collectionsPriceMax,
    state.collectionsPriceMax,
    DEFAULTS.collectionsPriceMax,
  );
  setBool(out, KEYS.collectionsFreeLoan, state.collectionsFreeLoan);
  setBool(out, KEYS.collectionsRevShare, state.collectionsRevShare);
  setBool(out, KEYS.collectionsPurchase, state.collectionsPurchase);

  return out;
}

/** Read "1"/"true"/"yes" as true; everything else (incl. absent) false. */
function readBool(raw: string | null): boolean {
  if (raw === null) return false;
  return ["1", "true", "yes"].includes(raw.toLowerCase());
}

/** Parse + clamp an int to [floor, ceil]; returns def if missing/NaN. */
function readNumClamped(
  raw: string | null,
  def: number,
  floor: number,
  ceil: number,
): number {
  if (raw === null) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(ceil, Math.max(floor, n));
}

/** Parse a value against an allow-list; returns def for anything else. */
function readEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  def: T,
): T {
  if (raw !== null && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return def;
}

/**
 * Read the in-scope filter state out of the current URL params.
 * Returns a PARTIAL — only the fields that are present and valid in
 * the URL. Missing or garbage params are simply omitted so the caller
 * can spread this over the page's default useState values without a
 * field ever flipping to a junk value.
 */
export function parseFilters(
  sp: SearchParamsLike | null | undefined,
): Partial<BrowseFilterState> {
  const out: Partial<BrowseFilterState> = {};
  if (!sp) return out;

  // sorts
  const asort = sp.get(KEYS.artistSort);
  if (asort !== null) out.artistSort = readEnum(asort, ARTIST_SORTS, DEFAULTS.artistSort);
  const gsort = sp.get(KEYS.gallerySort);
  if (gsort !== null) out.gallerySort = readEnum(gsort, GALLERY_SORTS, DEFAULTS.gallerySort);

  // gallery selects / text — free-form strings, taken verbatim. The
  // page validates the option exists before applying it to the result
  // filter (an unknown theme simply matches nothing), so no allow-list
  // is needed here and we stay decoupled from the theme/medium data.
  const gtheme = sp.get(KEYS.galleryTheme);
  if (gtheme !== null && gtheme !== "") out.galleryTheme = gtheme;
  const gmedium = sp.get(KEYS.galleryMedium);
  if (gmedium !== null && gmedium !== "") out.galleryMedium = gmedium;
  const gstyle = sp.get(KEYS.galleryStyle);
  if (gstyle !== null && gstyle !== "") out.galleryStyle = gstyle;

  // gallery booleans — only set when the param is present at all, so a
  // bare param key still hydrates and an absent one leaves the default.
  if (sp.get(KEYS.galleryAvailableOnly) !== null)
    out.galleryAvailableOnly = readBool(sp.get(KEYS.galleryAvailableOnly));
  if (sp.get(KEYS.galleryOriginals) !== null)
    out.galleryOriginals = readBool(sp.get(KEYS.galleryOriginals));
  if (sp.get(KEYS.galleryPrints) !== null)
    out.galleryPrints = readBool(sp.get(KEYS.galleryPrints));
  if (sp.get(KEYS.galleryFraming) !== null)
    out.galleryFraming = readBool(sp.get(KEYS.galleryFraming));
  if (sp.get(KEYS.galleryFreeLoan) !== null)
    out.galleryFreeLoan = readBool(sp.get(KEYS.galleryFreeLoan));
  if (sp.get(KEYS.galleryRevenueShare) !== null)
    out.galleryRevenueShare = readBool(sp.get(KEYS.galleryRevenueShare));
  if (sp.get(KEYS.galleryPurchase) !== null)
    out.galleryPurchase = readBool(sp.get(KEYS.galleryPurchase));

  // gallery numbers, clamped to the slider ranges
  if (sp.get(KEYS.galleryPriceMin) !== null)
    out.galleryPriceMin = readNumClamped(
      sp.get(KEYS.galleryPriceMin),
      DEFAULTS.galleryPriceMin,
      GALLERY_PRICE_FLOOR,
      GALLERY_PRICE_CEIL,
    );
  if (sp.get(KEYS.galleryPriceMax) !== null)
    out.galleryPriceMax = readNumClamped(
      sp.get(KEYS.galleryPriceMax),
      DEFAULTS.galleryPriceMax,
      GALLERY_PRICE_FLOOR,
      GALLERY_PRICE_CEIL,
    );
  if (sp.get(KEYS.galleryRevenueShareMin) !== null)
    out.galleryRevenueShareMin = readNumClamped(
      sp.get(KEYS.galleryRevenueShareMin),
      DEFAULTS.galleryRevenueShareMin,
      REV_SHARE_MIN,
      REV_SHARE_MAX,
    );

  // gallery location mode
  if (sp.get(KEYS.galleryLocationMode) !== null)
    out.galleryLocationMode = readEnum(
      sp.get(KEYS.galleryLocationMode),
      LOCATION_MODES,
      DEFAULTS.galleryLocationMode,
    );

  // gallery sizes — split, keep only known bands, drop dups via Set.
  const gsizes = sp.get(KEYS.gallerySizes);
  if (gsizes !== null) {
    const parsed = new Set<SizeBand>();
    for (const tok of gsizes.split(",")) {
      const t = tok.trim();
      if ((SIZE_BANDS as readonly string[]).includes(t)) parsed.add(t as SizeBand);
    }
    // Only set when at least one valid band parsed; an all-garbage
    // value leaves the default empty Set rather than an empty Set we
    // can't distinguish (same end state, but avoids a spurious key).
    if (parsed.size > 0) out.gallerySizes = parsed;
  }

  // collections
  if (sp.get(KEYS.collectionsLocationMode) !== null)
    out.collectionsLocationMode = readEnum(
      sp.get(KEYS.collectionsLocationMode),
      LOCATION_MODES,
      DEFAULTS.collectionsLocationMode,
    );
  if (sp.get(KEYS.collectionsPriceMin) !== null)
    out.collectionsPriceMin = readNumClamped(
      sp.get(KEYS.collectionsPriceMin),
      DEFAULTS.collectionsPriceMin,
      COLLECTIONS_PRICE_FLOOR,
      COLLECTIONS_PRICE_CEIL,
    );
  if (sp.get(KEYS.collectionsPriceMax) !== null)
    out.collectionsPriceMax = readNumClamped(
      sp.get(KEYS.collectionsPriceMax),
      DEFAULTS.collectionsPriceMax,
      COLLECTIONS_PRICE_FLOOR,
      COLLECTIONS_PRICE_CEIL,
    );
  if (sp.get(KEYS.collectionsFreeLoan) !== null)
    out.collectionsFreeLoan = readBool(sp.get(KEYS.collectionsFreeLoan));
  if (sp.get(KEYS.collectionsRevShare) !== null)
    out.collectionsRevShare = readBool(sp.get(KEYS.collectionsRevShare));
  if (sp.get(KEYS.collectionsPurchase) !== null)
    out.collectionsPurchase = readBool(sp.get(KEYS.collectionsPurchase));

  return out;
}

/**
 * Merge the serialized in-scope filters into a copy of `currentParams`,
 * preserving every non-filter key (view/discipline/sub/q/featured/loc_*)
 * and dropping any in-scope key that's now back at its default. This is
 * the exact string the page compares against the live query for its
 * loop guard, and writes via router.replace when they differ.
 *
 * Returns a query string WITHOUT a leading "?", or "" when empty.
 */
export function mergeFilterParams(
  state: BrowseFilterState,
  currentParams: SearchParamsLike & { toString(): string },
): string {
  const merged = new URLSearchParams(currentParams.toString());
  // Wipe every key we manage so a filter returning to default clears
  // its stale param instead of lingering.
  for (const key of FILTER_PARAM_KEYS) merged.delete(key);
  // Layer the non-default filters back on.
  const serialized = serializeFilters(state);
  for (const [k, v] of serialized.entries()) merged.set(k, v);
  return merged.toString();
}
