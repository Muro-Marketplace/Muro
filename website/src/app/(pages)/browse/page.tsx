"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { artists as staticArtists, type Artist } from "@/data/artists";
import { themes } from "@/data/themes";
import { artistsToGalleryWorks } from "@/data/galleries";
import { collections as staticCollections, type ArtistCollection } from "@/data/collections";
import { DISCIPLINES, formatSubStyleLabel, getDisciplineById, resolveDiscipline, disciplineLabel } from "@/data/categories";
import { slugify } from "@/lib/slugify";
import { geocodePostcode } from "@/lib/geocode";
import { bandsForWork } from "@/components/browse/SizeBands";
import Button from "@/components/Button";
import BrowseArtistCard from "@/components/BrowseArtistCard";
import CollectionCard from "@/components/CollectionCard";
import SubscriptionUpsellBanner from "@/components/SubscriptionUpsellBanner";
import ArtworkThumb from "@/components/ArtworkThumb";
import SaveButton from "@/components/SaveButton";
import SearchInput from "@/components/SearchInput";
import PostcodeInput, { readPersistedCoords, clearPersistedLocation } from "@/components/PostcodeInput";
import {
  ANY_DISTANCE,
  DEFAULT_MAX_DISTANCE,
  parseLocationParams,
  serializeLocationParams,
  type ParsedLocation,
} from "./locationParams";

/** Haversine great-circle distance in miles */
function calcDistance(
  userLat: number,
  userLng: number,
  artistLat: number,
  artistLng: number
): number {
  const R = 3958.8;
  const dLat = ((artistLat - userLat) * Math.PI) / 180;
  const dLng = ((artistLng - userLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((artistLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const VENUE_TYPES = [
  "Cafés",
  "Restaurants",
  "Hotels",
  "Offices",
  "Bars",
  "Galleries",
  "Salons",
];

const DISTANCE_OPTIONS = [
  { label: "5 miles", value: 5 },
  { label: "10 miles", value: 10 },
  { label: "25 miles", value: 25 },
  { label: "50 miles", value: 50 },
  { label: "UK-wide", value: 9999 },
];


interface Filters {
  mode: "local" | "global";
  themes: string[];
  originals: boolean;
  prints: boolean;
  framing: boolean;
  // Three arrangement filters, independent toggles. Revenue share applies a
  // minimum % via the slider below.
  revenueShare: boolean;
  paidLoan: boolean;
  revenueShareMin: number;
  outrightPurchase: boolean;
  // Retained for any deep-link URL containing the legacy "freeLoan" param so
  // historical bookmarks don't 404 the whole filter. Not surfaced in the UI.
  freeLoan: boolean;
  venueTypes: string[];
  styleMedium: string;
}

const DEFAULT_FILTERS: Filters = {
  // Distance slider is the only location control now (#9). Default
  // mode is "local" so the slider applies whenever the user has set
  // a location; without a location, the filter logic bails out so
  // results are still global until a postcode/geo lands.
  //
  // `maxDistance` lives in the URL (loc params) so it survives the
  // view-switch links, see locationParams.ts and Plan C Task 8.
  mode: "local",
  themes: [],
  originals: false,
  prints: false,
  framing: false,
  revenueShare: false,
  paidLoan: false,
  revenueShareMin: 0,
  outrightPurchase: false,
  freeLoan: false,
  venueTypes: [],
  styleMedium: "",
};

function CheckPill({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 cursor-pointer group text-left"
    >
      <span
        className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors duration-150 ${
          checked
            ? "bg-accent border-accent"
            : "border-border group-hover:border-muted"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1.5 5 4 7.5 8.5 2.5" />
          </svg>
        )}
      </span>
      <span className="text-sm text-foreground/70 group-hover:text-foreground transition-colors duration-150">
        {label}
      </span>
    </button>
  );
}

/**
 * Self-contained distance slider with a debounced URL commit.
 *
 * The "stuck slider" bug had three flavours, fixed in three commits:
 *   1. Controlled value lived in the URL → router.replace lag → thumb
 *      snapped back during fast drags. Solved with local draft state.
 *   2. onMouseUp on the slider misses the common "release outside the
 *      thumb" case → draft never committed. Solved with a 250ms idle
 *      debounce that fires regardless of release location.
 *   3. Safari/WebKit fights React-controlled <input type="range"> even
 *      with local state. Solved with `defaultValue` + a `key` keyed to
 *      the URL value (so external commits remount, internal drag
 *      doesn't).
 *
 * Even with all three, on Safari the page felt "rate limited" after a
 * few drags because the draft state lived at the *page* level — every
 * input event re-rendered the entire portfolio grid (30+ artist cards,
 * no React.memo). Lifting the draft into this child component means
 * a drag re-renders ~one slider's worth of JSX, not the whole page.
 *
 * The component is intentionally render-prop-light: `numberInputSuffix`
 * lets each call site drop in its own trailing element ("mi" label vs
 * "Change postcode" button) without forking the component.
 */
function DistanceSliderControl({
  value,
  onCommit,
  labelClassName,
  shortAny = false,
  withNumberInput = false,
  numberInputRowClassName = "flex items-center gap-2",
  numberInputSuffix,
  sliderClassName = "w-full accent-accent h-1.5 cursor-pointer",
}: {
  value: number;
  onCommit: (n: number) => void;
  labelClassName: string;
  shortAny?: boolean;
  withNumberInput?: boolean;
  numberInputRowClassName?: string;
  numberInputSuffix?: ReactNode;
  sliderClassName?: string;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const display = draft ?? value;
  const isAny = display >= 9999;
  const labelText = isAny
    ? `Within ${shortAny ? "any" : "any distance"}`
    : `Within ${display} mi`;

  // Debounced commit — handles every release scenario (mouseup outside,
  // touchend on a different element, blur from number input). 250ms idle
  // is long enough to avoid mid-drag commits but short enough not to
  // feel sluggish.
  useEffect(() => {
    if (draft == null) return;
    const t = setTimeout(() => {
      onCommit(draft);
      setDraft(null);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, onCommit]);

  const slider = (
    <input
      type="range"
      min={0}
      max={200}
      step={1}
      key={`maxd-${value}`}
      defaultValue={isAny ? 200 : display}
      onChange={(e) => {
        const v = Number(e.target.value);
        setDraft(v >= 200 ? ANY_DISTANCE : v);
      }}
      className={sliderClassName}
    />
  );

  return (
    <>
      <p className={labelClassName}>{labelText}</p>
      {withNumberInput ? (
        <div className="space-y-2.5">
          {slider}
          <div className={numberInputRowClassName}>
            <input
              type="number"
              min={0}
              max={9999}
              value={isAny ? "" : display}
              placeholder="Any"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { setDraft(ANY_DISTANCE); return; }
                setDraft(Math.max(0, Number(raw) || 0));
              }}
              className="w-20 px-2 py-1 text-xs bg-surface border border-border rounded-sm text-foreground focus:outline-none focus:border-accent/50"
            />
            {numberInputSuffix}
          </div>
        </div>
      ) : (
        slider
      )}
    </>
  );
}

// Wrap the real page body in <Suspense> so useSearchParams doesn't deopt the
// entire route tree and blow up the static prerender during `next build`.
export default function BrowsePortfoliosPage() {
  return (
    <Suspense fallback={null}>
      <BrowsePortfoliosPageInner />
    </Suspense>
  );
}

const PAGE_SIZE = 20;

function BrowsePortfoliosPageInner() {
  // activeDiscipline stores either:
  //   - a discipline id (e.g. "photography")
  //   - "" for All
  //   - "collections", sentinel for the Collections view (kept for back-compat
  //     with the existing view-switcher buttons and ?view=collections param).
  const [activeDiscipline, setActiveDiscipline] = useState<string>("");
  const [activeSubStyles, setActiveSubStyles] = useState<Set<string>>(new Set());
  // Default to Gallery (works) on first load (#4), there are
  // 5–10× more works than artists, so the marketplace looks fuller
  // and more compelling on initial visit. Users can flip to
  // Portfolios via the toggle or `?view=portfolios`.
  const [viewAs, setViewAs] = useState<"artists" | "works">("works");
  // Pagination, "Show 20 more" pattern per view.
  const [loadedArtists, setLoadedArtists] = useState(PAGE_SIZE);
  const [loadedWorks, setLoadedWorks] = useState(PAGE_SIZE);
  const [loadedCollections, setLoadedCollections] = useState(PAGE_SIZE);

  // Drive view from ?view= query param (F47). We use searchParams rather than
  // window.location.hash because Next.js Link same-page hash changes use
  // pushState, which doesn't fire hashchange, so the page wouldn't react.
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams?.get("view") || "";

  // Pill toggles call this so the URL updates alongside the local
  // viewAs / activeDiscipline state. Without it the marketplace nav
  // tabs (which key off `?view=`) didn't update when the user
  // switched via the in-page pills.
  //
  // Plan C #2.8: merge the new `view` into the existing search
  // params so location filter params (loc_lat / loc_lng / etc.)
  // survive a view switch. Previously this overwrote the whole
  // query string, so setting "Within 10km" on Galleries and tabbing
  // to Collections wiped the filter.
  // Search query, mirrored to ?q= so the filter persists across reloads
  // and shows up in shared links. Read directly from the URL on every
  // render so SearchInput's debounced setter (Plan F #4) stays the only
  // owner of the value — no extra useState to keep in sync.
  const searchQuery = searchParams?.get("q") || "";
  const setSearchQuery = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) params.set("q", next);
      else params.delete("q");
      const qs = params.toString();
      router.replace(`/browse${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams],
  );

  const switchView = useCallback((target: "gallery" | "portfolios" | "collections") => {
    if (target === "gallery") {
      setViewAs("works");
      setActiveDiscipline("");
    } else if (target === "portfolios") {
      setViewAs("artists");
      setActiveDiscipline("");
    } else {
      setActiveDiscipline("collections");
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (target === "gallery") params.delete("view");
    else params.set("view", target);
    const qs = params.toString();
    // replace (not push) so toggling doesn't bloat the back-stack.
    router.replace(`/browse${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);
  // Reset pagination when switching views / categories so users don't land
  // on an empty grid if they scroll back to a narrow filter.
  useEffect(() => {
    setLoadedArtists(PAGE_SIZE);
    setLoadedWorks(PAGE_SIZE);
    setLoadedCollections(PAGE_SIZE);
  }, [activeDiscipline, viewAs]);

  useEffect(() => {
    // Default + each explicit view drive the same state. Without
    // the default branch, clicking Portfolios → then the Galleries
    // nav link (which goes to /browse with no view param) used to
    // leave viewAs at "artists" so the page stayed on portfolios.
    if (viewParam === "collections") {
      setActiveDiscipline("collections");
    } else if (viewParam === "portfolios") {
      setActiveDiscipline("");
      setViewAs("artists");
    } else {
      // viewParam === "gallery" or "" → Galleries is the default.
      setActiveDiscipline("");
      setViewAs("works");
    }
  }, [viewParam]);
  const [artistSort, setArtistSort] = useState<"featured" | "name" | "revenue_share" | "distance">("featured");
  const [gallerySort, setGallerySort] = useState<"featured" | "recent" | "az" | "price_low" | "price_high" | "revenue_share" | "distance">("featured");
  // Gallery grid uses a JS-distributed masonry so images of varying heights
  // slot together with no row-whitespace, while reading order stays left-to-
  // right, top-to-bottom (CSS `columns-*` alone gives the masonry look but
  // fills top-to-bottom per column, which breaks the sort). We track the
  // viewport-based column count in state and recompute on resize.
  const [galleryColCount, setGalleryColCount] = useState(2);
  useEffect(() => {
    function compute() {
      const w = window.innerWidth;
      if (w >= 1024) setGalleryColCount(3);
      else setGalleryColCount(2);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [artists, setArtists] = useState<Artist[]>(staticArtists);
  const [collections, setCollections] = useState<ArtistCollection[]>(staticCollections);
  // Tracks whether live DB data has replaced the static seed (#1).
  // While false the marketplace still paints with the seed grid for
  // instant first paint, but result counts are suppressed so the
  // user doesn't see e.g. "40 works" jump to "42 works" once the
  // DB fetch lands a moment later.
  const [dataReady, setDataReady] = useState(false);

  // User location state. Lives in the URL (loc_lat / loc_lng /
  // loc_label / maxDistance) so it survives the `?view=` switch
  // links and is shareable / back-forward friendly. See
  // Plan C #2.8 + locationParams.ts.
  //
  // localStorage is still used as a one-time hydration source: if a
  // user lands on /browse with no location params but had one stored
  // last visit, we re-write it to the URL on mount. Subsequent
  // changes are URL-driven.
  const parsedLocation = useMemo(
    () => parseLocationParams(searchParams),
    [searchParams],
  );
  const userCoords = parsedLocation.coords;
  const postcodeInput = parsedLocation.label;
  const maxDistance = parsedLocation.maxDistance;

  const [geoRequesting, setGeoRequesting] = useState(false);
  const [postcodeError, setPostcodeError] = useState(false);

  /** Write the desired location into the URL, merging with any
   *  non-location params already there (`view`, etc.). */
  const setLocation = useCallback(
    (next: ParsedLocation) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const merged = serializeLocationParams(next, params);
      const qs = merged.toString();
      router.replace(qs ? `?${qs}` : "/browse", { scroll: false });
    },
    [searchParams, router],
  );

  // Helper for the common "user just resolved a location" path
  // (postcode geocode or geolocation success). Keeps maxDistance
  // intact so a buyer that had set "Within 10mi" doesn't see it
  // jump back to the default when they re-enter their postcode.
  const updateLocationCoords = useCallback(
    (coords: { lat: number; lng: number }, label: string) => {
      setLocation({ coords, label, maxDistance: parsedLocation.maxDistance });
    },
    [setLocation, parsedLocation.maxDistance],
  );

  /** Drop location entirely. Mirrors the "change postcode" UI. */
  const clearLocation = useCallback(() => {
    setLocation({ coords: null, label: "", maxDistance: DEFAULT_MAX_DISTANCE });
    clearPersistedLocation();
  }, [setLocation]);

  /** Just the maxDistance dimension. Coords + label stay put. */
  const setMaxDistance = useCallback(
    (n: number) => {
      // No-op if no location is set, the slider isn't visible in
      // that state but this guards against e.g. a deep link writing
      // a stale maxDistance into a no-coords URL.
      if (!parsedLocation.coords) return;
      setLocation({ ...parsedLocation, maxDistance: Math.max(0, n) });
    },
    [parsedLocation, setLocation],
  );

  // Distance slider's draft state lives in the <DistanceSliderControl>
  // child component now — see the doc comment on that component for the
  // full bug-fix history. Lifting it down means a drag only re-renders
  // the slider, not the entire portfolio grid.

  // Hydrate from localStorage on first mount when the URL itself is
  // location-less. This keeps the existing UX where a returning
  // visitor doesn't re-enter their postcode, while still letting a
  // shared URL with explicit loc_* params win over the stored value.
  // Run-once flag (a ref would do too) keeps a re-hydrate from
  // firing if the user clears the location, since `parsedLocation`
  // becomes coords:null again.
  const hydratedFromStorageRef = useRef(false);
  useEffect(() => {
    if (hydratedFromStorageRef.current) return;
    hydratedFromStorageRef.current = true;
    if (parsedLocation.coords) return; // URL is the source of truth
    const stored = readPersistedCoords();
    if (stored) {
      setLocation({
        coords: stored.coords,
        label: stored.label ?? "",
        maxDistance: parsedLocation.maxDistance,
      });
    }
    // Intentionally only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch merged artists (static + database) on mount.
  //
  // Both endpoints are awaited via Promise.allSettled so `dataReady`
  // only flips once we know neither call is in flight, that's what
  // un-suppresses the result counts in the header. If a call fails
  // we still flip to ready (we'd rather show stale-seed counts than
  // a permanent dash on a network blip).
  useEffect(() => {
    const a = fetch("/api/browse-artists")
      .then((res) => res.json())
      .then((data) => {
        if (data.artists?.length) setArtists(data.artists);
      })
      .catch(() => { /* keep static data */ });
    const c = fetch("/api/browse-collections")
      .then((res) => res.json())
      .then((data) => {
        const apiCollections: ArtistCollection[] = data.collections || [];
        setCollections(apiCollections);
      })
      .catch(() => { /* keep static data */ });
    Promise.allSettled([a, c]).then(() => setDataReady(true));
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"compact" | "expanded">("compact");
  const [mobileGrid, setMobileGrid] = useState<1 | 2>(1);

  // Gallery mode filters
  const [galleryTheme, setGalleryTheme] = useState("");
  const [galleryMedium, setGalleryMedium] = useState("");
  const [galleryAvailableOnly, setGalleryAvailableOnly] = useState(false);
  const [galleryPriceMin, setGalleryPriceMin] = useState(0);
  const [galleryPriceMax, setGalleryPriceMax] = useState(1000);
  // Mirror of `filters.mode` for the gallery view, kept so existing
  // distance-filter call sites keep working, but the toggle UI was
  // removed (#9) so this is effectively pinned to "local". A future
  // refactor can drop this state entirely.
  const [galleryLocationMode, setGalleryLocationMode] = useState<"global" | "local">("local");
  const [galleryStyle, setGalleryStyle] = useState("");
  const [galleryOriginals, setGalleryOriginals] = useState(false);
  const [galleryPrints, setGalleryPrints] = useState(false);
  const [galleryFraming, setGalleryFraming] = useState(false);
  const [galleryFreeLoan, setGalleryFreeLoan] = useState(false);
  const [galleryRevenueShare, setGalleryRevenueShare] = useState(false);
  const [galleryRevenueShareMin, setGalleryRevenueShareMin] = useState(0);
  const [galleryPurchase, setGalleryPurchase] = useState(false);
  // Size filter (#7), multi-select bands keyed off the largest
  // dimension of each work in cm. Empty set = no filter (default).
  // Bands cover the practical wall-art range:
  //   small  ≤ 30cm   (A4 / postcard / desk pieces)
  //   medium 30–60cm  (A2 / mid-sized prints + originals)
  //   large  60–100cm (statement pieces, sofa-width works)
  //   xl     >100cm   (gallery-scale, oversized commissions)
  type SizeBand = "small" | "medium" | "large" | "xl";
  const [gallerySizes, setGallerySizes] = useState<Set<SizeBand>>(new Set());

  // Collections view location filter, independent of artists/gallery so the
  // filter state doesn't bleed across views.
  // Mirror of #9, pin to "local" so the slider applies whenever a
  // postcode is set; toggle UI removed in favour of the slider +
  // PostcodeInput pattern used by the other views.
  const [collectionsLocationMode, setCollectionsLocationMode] = useState<"global" | "local">("local");
  // Collection-list filters (#42 parity pass), bundle price + which
  // arrangements the underlying artist is open to. Kept separate
  // from the gallery filter state so toggling between views doesn't
  // bleed filter values across.
  const [collectionsPriceMin, setCollectionsPriceMin] = useState(0);
  const [collectionsPriceMax, setCollectionsPriceMax] = useState(2000);
  const [collectionsFreeLoan, setCollectionsFreeLoan] = useState(false);
  const [collectionsRevShare, setCollectionsRevShare] = useState(false);
  const [collectionsPurchase, setCollectionsPurchase] = useState(false);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTheme(theme: string) {
    setFilters((prev) => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter((t) => t !== theme)
        : [...prev.themes, theme],
    }));
  }

  function toggleVenueType(type: string) {
    setFilters((prev) => ({
      ...prev,
      venueTypes: prev.venueTypes.includes(type)
        ? prev.venueTypes.filter((t) => t !== type)
        : [...prev.venueTypes, type],
    }));
  }

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    // Match the pre-Plan-C behaviour: clear-all resets the distance
    // slider back to the default but keeps the user's coords (so a
    // postcode they typed once doesn't get wiped on a single click).
    if (parsedLocation.coords && parsedLocation.maxDistance !== DEFAULT_MAX_DISTANCE) {
      setMaxDistance(DEFAULT_MAX_DISTANCE);
    }
  };

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return; // will fall through to postcode input
    }
    setGeoRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateLocationCoords(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          "Current location",
        );
        setGeoRequesting(false);
      },
      () => {
        setGeoRequesting(false); // show postcode input
      },
      { timeout: 10000 }
    );
  }, [updateLocationCoords]);

  const hasActiveFilters =
    // mode is permanently "local" now (toggle removed); the actual
    // signal of "user has applied a location filter" is whether
    // their coords are set.
    !!userCoords ||
    filters.themes.length > 0 ||
    filters.originals ||
    filters.prints ||
    filters.framing ||
    filters.revenueShare ||
    filters.paidLoan ||
    filters.freeLoan ||
    filters.revenueShare ||
    filters.revenueShareMin > 0 ||
    filters.outrightPurchase ||
    filters.venueTypes.length > 0 ||
    filters.styleMedium !== "";

  // Get active discipline object. "collections" is a UI-only sentinel that
  // activates the Collections view, so we explicitly treat it as null here.
  const activeDisciplineObj = useMemo(
    () => (activeDiscipline && activeDiscipline !== "collections" ? getDisciplineById(activeDiscipline) : null),
    [activeDiscipline]
  );

  // Available sub-styles for the active discipline, narrowed to ones that at
  // least one artist in the current data set actually has. This keeps the pill
  // row from showing totally empty buckets.
  const availableSubStyles = useMemo(() => {
    if (!activeDisciplineObj) return [] as string[];
    const artistsInDiscipline = artists.filter(
      (a) => resolveDiscipline(a.primaryMedium, a.discipline) === activeDisciplineObj.id,
    );
    const subs = new Set<string>();
    for (const sub of activeDisciplineObj.subStyles) {
      if (artistsInDiscipline.some((a) => a.subStyles?.includes(sub))) {
        subs.add(sub);
      }
    }
    return Array.from(subs);
  }, [activeDisciplineObj, artists]);

  const filteredArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return artists.filter((artist) => {
      // Must have at least one artwork to appear in marketplace
      if (!artist.works || artist.works.length === 0) return false;
      // Free-text search across name + medium + bio + tags. Plan F Task 4.
      if (q) {
        const haystack = [
          artist.name,
          artist.primaryMedium,
          artist.shortBio,
          artist.location,
          ...(artist.styleTags || []),
          ...(artist.themes || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Discipline filter, fall back to inferring from primary medium
      // so seed artists (without an explicit discipline field) and older
      // DB rows that missed the backfill still match the right category.
      if (activeDisciplineObj) {
        const effective = resolveDiscipline(artist.primaryMedium, artist.discipline);
        if (effective !== activeDisciplineObj.id) return false;
      }
      // Sub-style filter, artist must have at least one of the active sub-styles
      if (activeSubStyles.size > 0 && !artist.subStyles?.some((s) => activeSubStyles.has(s))) return false;

      // Distance filter, only applies when the user has set a
      // location AND the artist has known coordinates. Without a
      // user location we used to return false here, which hid every
      // artist on first load (the bug behind "portfolios still
      // doesn't show any artists when it should show them all").
      // Now no-location means no filter; an artist without coords
      // is also kept (we don't penalise missing data).
      if (filters.mode === "local" && userCoords && artist.coordinates) {
        const dist = calcDistance(
          userCoords.lat,
          userCoords.lng,
          artist.coordinates.lat,
          artist.coordinates.lng
        );
        if (dist > maxDistance) return false;
      }
      if (
        filters.themes.length > 0 &&
        !filters.themes.some((t) => artist.themes.includes(t))
      )
        return false;
      if (filters.originals && !artist.offersOriginals) return false;
      if (filters.prints && !artist.offersPrints) return false;
      if (filters.framing && !artist.offersFramed) return false;
      // Independent arrangement filters, any combination can be active.
      if (filters.revenueShare && !artist.openToRevenueShare) return false;
      if (filters.paidLoan && !artist.openToFreeLoan) return false;
      if (filters.outrightPurchase && !artist.openToOutrightPurchase) return false;
      // Min rev share threshold only applies when Revenue Share is the
      // active arrangement, ignored otherwise.
      if (
        filters.revenueShare &&
        filters.revenueShareMin > 0 &&
        (!artist.revenueSharePercent || artist.revenueSharePercent < filters.revenueShareMin)
      ) {
        return false;
      }
      // Legacy freeLoan URL param still works, matches either Revenue Share
      // or Paid Loan capability.
      if (filters.freeLoan && !artist.openToFreeLoan && !artist.openToRevenueShare) return false;
      if (
        filters.venueTypes.length > 0 &&
        !filters.venueTypes.some((v) => artist.venueTypesSuitedFor.includes(v))
      )
        return false;
      if (
        filters.styleMedium &&
        !artist.primaryMedium
          .toLowerCase()
          .includes(filters.styleMedium.toLowerCase()) &&
        !artist.styleTags.some((t) =>
          t.toLowerCase().includes(filters.styleMedium.toLowerCase())
        )
      )
        return false;
      return true;
    }).sort((a, b) => {
      if (artistSort === "name") return a.name.localeCompare(b.name);
      if (artistSort === "revenue_share") return (b.revenueSharePercent || 0) - (a.revenueSharePercent || 0);
      if (artistSort === "distance" && userCoords) {
        const da = a.coordinates ? calcDistance(userCoords.lat, userCoords.lng, a.coordinates.lat, a.coordinates.lng) : Infinity;
        const db = b.coordinates ? calcDistance(userCoords.lat, userCoords.lng, b.coordinates.lat, b.coordinates.lng) : Infinity;
        return da - db;
      }
      // "featured": Pro-tier artists (the ones wearing the Featured chip)
      // first, then Premium, then everyone else, with founding-artist
      // status as the final tiebreaker. Previously sorted only by
      // isFoundingArtist, which made the chip and the sort disagree.
      const tierWeight = (plan?: string | null) => {
        const p = (plan || "").toLowerCase();
        if (p === "pro") return 0;
        if (p === "premium") return 1;
        return 2;
      };
      const wa = tierWeight(a.subscriptionPlan);
      const wb = tierWeight(b.subscriptionPlan);
      if (wa !== wb) return wa - wb;
      if (a.isFoundingArtist && !b.isFoundingArtist) return -1;
      if (!a.isFoundingArtist && b.isFoundingArtist) return 1;
      return 0;
    });
  }, [artists, filters, userCoords, maxDistance, activeDisciplineObj, activeSubStyles, artistSort, searchQuery]);

  const allMediums = useMemo(
    () => Array.from(new Set(artists.map((a) => a.primaryMedium))).sort(),
    []
  );

  const allGalleryWorks = useMemo(() => artistsToGalleryWorks(artists), [artists]);

  const allGalleryMediums = useMemo(
    () => Array.from(new Set(allGalleryWorks.map((w) => w.medium))).sort(),
    [allGalleryWorks]
  );

  const filteredGalleryWorks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allGalleryWorks.filter((work) => {
      // Free-text search, Plan F Task 4. Match on title / artist name /
      // medium so works AND their authors are findable from one input.
      if (q) {
        const haystack = [
          work.title,
          work.artistName,
          work.medium,
          work.artistPrimaryMedium,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Discipline filter
      if (activeDisciplineObj && work.artistDiscipline !== activeDisciplineObj.id) return false;
      // Sub-style filter, work's artist must have at least one matching sub-style
      if (activeSubStyles.size > 0 && !work.artistSubStyles?.some((s) => activeSubStyles.has(s))) return false;
      // Theme
      if (galleryTheme && !work.themes.includes(galleryTheme)) return false;
      // Medium (work-level)
      if (galleryMedium && work.medium !== galleryMedium) return false;
      // Style (artist primary medium)
      if (galleryStyle && work.artistPrimaryMedium !== galleryStyle) return false;
      // Availability
      if (galleryAvailableOnly && !work.available) return false;
      // Price range
      if (galleryPriceMin > 0 || galleryPriceMax < 1000) {
        const match = work.priceBand.replace(/[£,]/g, "").match(/\d+/);
        if (match) {
          const low = parseInt(match[0], 10);
          if (low < galleryPriceMin) return false;
          if (galleryPriceMax < 1000 && low > galleryPriceMax) return false;
        }
      }
      // Originals / Prints / Framing
      if (galleryOriginals && !work.offersOriginals) return false;
      if (galleryPrints && !work.offersPrints) return false;
      if (galleryFraming && !work.offersFramed) return false;
      // Size band (#7), multi-select; work passes if ANY of the
      // sizes it offers fits a selected band. Previously we only
      // looked at the largest size, so a work shipping in A4 → A0
      // wouldn't show under the Small filter.
      if (gallerySizes.size > 0) {
        const bands = bandsForWork(work);
        let matches = false;
        for (const b of bands) {
          if (gallerySizes.has(b)) { matches = true; break; }
        }
        if (!matches) return false;
      }
      // Commercial terms
      if (galleryFreeLoan && !work.openToFreeLoan) return false;
      if (galleryRevenueShare && !work.openToRevenueShare) return false;
      if (galleryRevenueShare && galleryRevenueShareMin > 0 && (work.revenueSharePercent || 0) < galleryRevenueShareMin) return false;
      if (galleryPurchase && !work.openToOutrightPurchase) return false;
      // Location
      if (galleryLocationMode === "local" && userCoords && work.artistCoordinates) {
        const dist = calcDistance(userCoords.lat, userCoords.lng, work.artistCoordinates.lat, work.artistCoordinates.lng);
        if (dist > maxDistance) return false;
      }
      return true;
    }).sort((a, b) => {
      if (gallerySort === "recent") {
        // Recently listed (#5). Newer createdAt wins; works without
        // a timestamp (legacy/static seed data) sink to the bottom.
        const at = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
        const bt = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
        return bt - at;
      }
      if (gallerySort === "az") return a.title.localeCompare(b.title);
      if (gallerySort === "price_low") {
        const aPrice = a.pricing[0]?.price ?? 0;
        const bPrice = b.pricing[0]?.price ?? 0;
        return aPrice - bPrice;
      }
      if (gallerySort === "price_high") {
        const aPrice = a.pricing[0]?.price ?? 0;
        const bPrice = b.pricing[0]?.price ?? 0;
        return bPrice - aPrice;
      }
      if (gallerySort === "revenue_share") return (b.revenueSharePercent || 0) - (a.revenueSharePercent || 0);
      if (gallerySort === "distance" && userCoords) {
        const da = a.artistCoordinates ? calcDistance(userCoords.lat, userCoords.lng, a.artistCoordinates.lat, a.artistCoordinates.lng) : Infinity;
        const db = b.artistCoordinates ? calcDistance(userCoords.lat, userCoords.lng, b.artistCoordinates.lat, b.artistCoordinates.lng) : Infinity;
        return da - db;
      }
      // "featured": Pro-tier artists' works first, then Premium, then
      // everyone else, with founding-artist status as the tiebreaker.
      // Previously fell through to `return 0` which left the works in
      // whatever order the underlying flatMap produced, i.e. no actual
      // sort happened.
      const tierWeight = (plan?: string | null) => {
        const p = (plan || "").toLowerCase();
        if (p === "pro") return 0;
        if (p === "premium") return 1;
        return 2;
      };
      const wa = tierWeight(a.artistSubscriptionPlan);
      const wb = tierWeight(b.artistSubscriptionPlan);
      if (wa !== wb) return wa - wb;
      if (a.artistIsFounding && !b.artistIsFounding) return -1;
      if (!a.artistIsFounding && b.artistIsFounding) return 1;
      return 0;
    });
  }, [allGalleryWorks, galleryTheme, galleryMedium, galleryStyle, galleryAvailableOnly, galleryPriceMin, galleryPriceMax, galleryOriginals, galleryPrints, galleryFraming, galleryFreeLoan, galleryRevenueShare, galleryRevenueShareMin, galleryPurchase, gallerySizes, galleryLocationMode, userCoords, maxDistance, activeDisciplineObj, activeSubStyles, gallerySort, searchQuery]);

  const hasGalleryFilters =
    !!galleryTheme || !!galleryMedium || !!galleryStyle || galleryAvailableOnly || galleryPriceMin > 0 || galleryPriceMax < 1000 || galleryOriginals || galleryPrints || galleryFraming || galleryFreeLoan || galleryRevenueShare || galleryPurchase || !!userCoords || gallerySizes.size > 0;

  // Collections filter pipeline. Distance + bundle-price + the
  // artist's arrangement preferences (#42, the user complaint was
  // that collections only had location filtering vs portfolios/galleries
  // which had the full set).
  const filteredCollections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return collections.filter((c) => {
      if (!c.available) return false;
      // Free-text search, Plan F Task 4. Collections inherit search
      // matching against their own name + description and the underlying
      // artist's name so a search for the artist still surfaces their
      // bundles.
      if (q) {
        const collectionArtist = artists.find((a) => a.slug === c.artistSlug);
        const haystack = [
          c.name,
          c.description,
          c.artistName,
          collectionArtist?.primaryMedium,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Distance, only when the user has set a location.
      if (collectionsLocationMode === "local" && userCoords) {
        const artist = artists.find((a) => a.slug === c.artistSlug);
        if (!artist?.coordinates) return false;
        const dist = calcDistance(userCoords.lat, userCoords.lng, artist.coordinates.lat, artist.coordinates.lng);
        if (dist > maxDistance) return false;
      }
      // Bundle price.
      if (collectionsPriceMin > 0 && (c.bundlePrice || 0) < collectionsPriceMin) return false;
      if (collectionsPriceMax < 2000 && (c.bundlePrice || 0) > collectionsPriceMax) return false;
      // Arrangement chips, use the underlying artist's openTo* flags
      // (collections inherit terms from the artist, the same way the
      // detail page surfaces them as chips).
      if (collectionsFreeLoan || collectionsRevShare || collectionsPurchase) {
        const artist = artists.find((a) => a.slug === c.artistSlug);
        if (collectionsFreeLoan && !(artist?.openToFreeLoan ?? true)) return false;
        if (collectionsRevShare && !(artist?.openToRevenueShare ?? true)) return false;
        if (collectionsPurchase && !(artist?.openToOutrightPurchase ?? true)) return false;
      }
      return true;
    });
  }, [collections, collectionsLocationMode, userCoords, artists, maxDistance, collectionsPriceMin, collectionsPriceMax, collectionsFreeLoan, collectionsRevShare, collectionsPurchase, searchQuery]);

  const hasCollectionsFilters =
    collectionsLocationMode === "local" ||
    collectionsPriceMin > 0 ||
    collectionsPriceMax < 2000 ||
    collectionsFreeLoan ||
    collectionsRevShare ||
    collectionsPurchase;

  function clearCollectionsFilters() {
    setCollectionsPriceMin(0);
    setCollectionsPriceMax(2000);
    setCollectionsFreeLoan(false);
    setCollectionsRevShare(false);
    setCollectionsPurchase(false);
  }

  function clearGalleryFilters() {
    setGalleryTheme(""); setGalleryMedium(""); setGalleryStyle(""); setGalleryAvailableOnly(false);
    setGalleryPriceMin(0); setGalleryPriceMax(1000); setGalleryOriginals(false); setGalleryPrints(false); setGalleryFraming(false);
    setGalleryFreeLoan(false); setGalleryRevenueShare(false); setGalleryRevenueShareMin(0); setGalleryPurchase(false);
    setGalleryLocationMode("global");
    setGallerySizes(new Set());
  }

  /** Toggle a size band in/out of the active gallerySizes set. */
  function toggleSize(b: SizeBand) {
    setGallerySizes((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }
  const SIZE_BANDS: { id: SizeBand; label: string; sub: string }[] = [
    { id: "small", label: "Small", sub: "up to 30cm" },
    { id: "medium", label: "Medium", sub: "30 to 60cm" },
    { id: "large", label: "Large", sub: "60 to 100cm" },
    { id: "xl", label: "Extra-large", sub: "100cm+" },
  ];

  const filterPanel = (
    <div className="space-y-7">
      {/* Location (#9), the Local/Global toggle was removed; the
          slider is the only location control now. Default 25mi when
          a location is set. Drag to the right edge to switch back to
          "Anywhere". */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Location
        </p>
        {(() => {
          // Render the postcode + slider unconditionally, kept
          // inside an IIFE so we can keep the existing layout without
          // duplicating it under the old `filters.mode === "local"`
          // gate.
          return (
          <div className="space-y-3">
            {/* Location status */}
            {geoRequesting && (
              <p className="text-xs text-muted animate-pulse">Detecting your location…</p>
            )}
            {!geoRequesting && userCoords && (
              <p className="text-xs text-accent flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5 5 4 7.5 8.5 2.5" />
                </svg>
                Location set
                <button
                  type="button"
                  onClick={() => { clearLocation(); setPostcodeError(false); }}
                  className="ml-1 text-[10px] text-muted underline cursor-pointer"
                >
                  change
                </button>
              </p>
            )}
            {!geoRequesting && !userCoords && (
              <div>
                <p className="text-xs text-muted mb-1.5">Enter your postcode</p>
                <PostcodeInput
                  initial={postcodeInput}
                  onGeocoded={(coords, pc) => {
                    updateLocationCoords(coords, pc);
                    setPostcodeError(false);
                  }}
                  onError={(failed) => setPostcodeError(failed)}
                />
                {postcodeError && (
                  <p className="text-[10px] text-red-400 mt-1">Postcode not found, try again</p>
                )}
              </div>
            )}
            {/* Distance, max only, once we have a location (F48) */}
            {userCoords && (
              <div>
                <DistanceSliderControl
                  value={maxDistance}
                  onCommit={setMaxDistance}
                  labelClassName="text-xs text-muted mb-2"
                  withNumberInput
                  numberInputSuffix={<span className="text-xs text-muted">mi</span>}
                />
              </div>
            )}
          </div>
          );
        })()}
      </div>

      {/* Arrangement, three independent toggles for the core Wallplace
          models: Revenue Share, Paid Loan, Direct Purchase. Rev share min
          % shows as a slider beneath the Revenue Share tile when active. */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Arrangement
        </p>
        <div className="space-y-2">
          {/* Revenue Share */}
          <button
            type="button"
            onClick={() => setFilter("revenueShare", !filters.revenueShare)}
            aria-pressed={filters.revenueShare}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
              filters.revenueShare ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
            }`}
          >
            {/* Handshake, Lucide "handshake" glyph, stroked so it sits on
                the cream surface like the other filter icons. */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={filters.revenueShare ? "text-accent" : "text-muted"}>
              <path d="m11 17 2 2a1 1 0 1 0 3-3" />
              <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
              <path d="m21 3 1 11h-2" />
              <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
              <path d="M3 4h8" />
            </svg>
            <div>
              <p className="text-sm font-medium">Revenue Share</p>
              <p className="text-[10px] text-muted">Free on wall, split on QR sales</p>
            </div>
          </button>
          {filters.revenueShare && (
            <div className="pl-3 pr-1 pb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted">Minimum share</span>
                <span className="text-[11px] font-medium text-foreground">
                  {filters.revenueShareMin > 0 ? `${filters.revenueShareMin}%` : "Any"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={filters.revenueShareMin}
                onChange={(e) => setFilter("revenueShareMin", Number(e.target.value) || 0)}
                className="w-full accent-accent h-1 cursor-pointer"
                aria-label="Minimum revenue share"
              />
              <div className="flex justify-between text-[9px] text-muted mt-0.5">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
              </div>
            </div>
          )}

          {/* Paid Loan */}
          <button
            type="button"
            onClick={() => setFilter("paidLoan", !filters.paidLoan)}
            aria-pressed={filters.paidLoan}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
              filters.paidLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
            }`}
          >
            <span className={`text-base font-serif font-semibold leading-none w-4 text-center ${filters.paidLoan ? "text-accent" : "text-muted"}`}>&pound;</span>
            <div>
              <p className="text-sm font-medium">Paid Loan</p>
              <p className="text-[10px] text-muted">Monthly fee to display the work</p>
            </div>
          </button>

          {/* Direct Purchase */}
          <button
            type="button"
            onClick={() => setFilter("outrightPurchase", !filters.outrightPurchase)}
            aria-pressed={filters.outrightPurchase}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
              filters.outrightPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={filters.outrightPurchase ? "text-accent" : "text-muted"}>
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
            </svg>
            <div>
              <p className="text-sm font-medium">Direct Purchase</p>
              <p className="text-[10px] text-muted">Buy artwork outright</p>
            </div>
          </button>
        </div>
      </div>

      {/* Availability – commissions removed */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Availability
        </p>
        <div className="space-y-2.5">
          <CheckPill
            label="Originals available"
            checked={filters.originals}
            onChange={(v) => setFilter("originals", v)}
          />
          <CheckPill
            label="Prints available"
            checked={filters.prints}
            onChange={(v) => setFilter("prints", v)}
          />
          <CheckPill
            label="Framing available"
            checked={filters.framing}
            onChange={(v) => setFilter("framing", v)}
          />
        </div>
      </div>

      {/* Venue Suitability */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Venue Type
        </p>
        <div className="flex flex-wrap gap-1.5">
          {VENUE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleVenueType(type)}
              className={`px-2.5 py-1 text-xs rounded-sm border transition-all duration-150 cursor-pointer ${
                filters.venueTypes.includes(type)
                  ? "bg-accent text-white border-accent"
                  : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Style + Theme moved to the bottom of the panel, they're
          less actionable than the commercial filters above (location,
          arrangement, availability, venue type) so the high-priority
          options stay above the fold. */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Style
        </p>
        <select
          value={filters.styleMedium}
          onChange={(e) => setFilter("styleMedium", e.target.value)}
          className="w-full px-3 py-2 bg-[#F8F6F2] lg:bg-white border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
        >
          <option value="">All styles</option>
          {allMediums.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Theme
        </p>
        <select
          value={filters.themes[0] || ""}
          onChange={(e) => setFilter("themes", e.target.value ? [e.target.value] : [])}
          className="w-full px-3 py-2 bg-[#F8F6F2] lg:bg-white border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
        >
          <option value="">All themes</option>
          {themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Clear */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-background">

      {/* Discipline tabs */}
      <div className="border-b border-border bg-[#FAF8F5]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {/* All */}
            <button
              type="button"
              onClick={() => { setActiveDiscipline(""); setActiveSubStyles(new Set()); }}
              className={`py-4 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeDiscipline === ""
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            {DISCIPLINES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setActiveDiscipline(d.id); setActiveSubStyles(new Set()); }}
                className={`py-4 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeDiscipline === d.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
            {/* spacer so tabs don't stretch full width */}
            <div className="ml-auto" />
          </div>
        </div>
      </div>

      {/* Sub-style pills, only when a discipline is selected */}
      {activeDisciplineObj && activeDiscipline !== "collections" && (
        <div className="border-b border-border bg-white">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveSubStyles(new Set())}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                activeSubStyles.size === 0
                  ? "bg-foreground text-white border-foreground"
                  : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
              }`}
            >
              All {activeDisciplineObj.label}
            </button>
            {/* Render the full discipline sub-style list so the pill row is
                stable even when no artists currently match a particular
                sub-style. Pills for sub-styles with no artists are rendered
                but muted, they still let a user clear any active filter. */}
            {activeDisciplineObj.subStyles.map((sub) => {
              const hasArtists = availableSubStyles.includes(sub);
              const active = activeSubStyles.has(sub);
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setActiveSubStyles((prev) => { const next = new Set(prev); if (next.has(sub)) next.delete(sub); else next.add(sub); return next; })}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-foreground text-white border-foreground"
                      : hasArtists
                        ? "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        : "border-border/50 bg-[#F8F6F2]/60 lg:bg-white/60 text-muted/50 hover:border-foreground/20"
                  }`}
                >
                  {formatSubStyleLabel(sub)}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-muted shrink-0">
              {dataReady
                ? viewAs === "artists"
                  ? `${filteredArtists.length} artists`
                  : `${filteredGalleryWorks.length} works`
                : "…"}
            </span>
          </div>
        </div>
      )}

      {activeDiscipline !== "collections" && viewAs === "artists" && (
        /* ── Artists view ── */
        <section className="pt-5 pb-10 lg:pt-8 lg:pb-14">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="flex gap-10 lg:gap-14 items-start">
              {/* Sidebar – desktop */}
              <aside className="hidden lg:block w-56 shrink-0 sticky top-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium text-foreground">
                    Filters
                  </span>
                  {hasActiveFilters && (
                    <span className="text-xs text-white bg-accent rounded-full w-5 h-5 flex items-center justify-center">
                      {
                        [
                          filters.mode === "local",
                          ...filters.themes.map(() => true),
                          filters.originals,
                          filters.prints,
                          filters.framing,
                          filters.freeLoan,
                          filters.revenueShare,
                          filters.revenueShareMin > 0,
                          filters.outrightPurchase,
                          ...filters.venueTypes.map(() => true),
                          !!filters.styleMedium,
                        ].filter(Boolean).length
                      }
                    </span>
                  )}
                </div>
                {filterPanel}
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {dataReady ? (
                      <>
                        {filteredArtists.length} artist
                        {filteredArtists.length !== 1 ? "s" : ""}
                      </>
                    ) : (
                      "…"
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* View dropdown (mobile, pill-shaped native select) */}
                    <div className="relative">
                      <select
                        value={activeDiscipline === "collections" ? "collections" : ((viewAs as string) === "works" ? "gallery" : "portfolios")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "collections") switchView("collections");
                          else if (v === "gallery") switchView("gallery");
                          else switchView("portfolios");
                        }}
                        className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                      >
                        <option value="gallery">Galleries</option>
                        <option value="portfolios">Portfolios</option>
                        <option value="collections">Collections</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <polyline points="2 4 6 8 10 4" />
                      </svg>
                    </div>
                    {/* Grid toggle */}
                    <button
                      type="button"
                      onClick={() => setMobileGrid(mobileGrid === 1 ? 2 : 1)}
                      className={`p-2 border rounded-sm transition-colors ${mobileGrid === 2 ? "border-foreground bg-foreground text-white" : "border-border text-muted"}`}
                      title={mobileGrid === 1 ? "Two columns" : "Single column"}
                    >
                      {mobileGrid === 2 ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="0.5" /><rect x="8" y="0" width="6" height="6" rx="0.5" /><rect x="0" y="8" width="6" height="6" rx="0.5" /><rect x="8" y="8" width="6" height="6" rx="0.5" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="14" height="4" rx="0.5" /><rect x="0" y="5" width="14" height="4" rx="0.5" /><rect x="0" y="10" width="14" height="4" rx="0.5" /></svg>
                      )}
                    </button>
                    {/* Filters */}
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="flex items-center gap-2 px-4 py-2 border border-border rounded-sm text-sm text-foreground hover:border-foreground/30 transition-colors duration-150 cursor-pointer"
                    >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                    Filters{hasActiveFilters && " •"}
                  </button>
                  </div>
                </div>

                {/* Mobile filter panel */}
                {sidebarOpen && (
                  <div className="lg:hidden mb-8 p-5 bg-surface border border-border rounded-sm">
                    {filterPanel}
                  </div>
                )}

                {/* Search + count + view toggle – desktop */}
                <div className="hidden lg:flex items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-64">
                      <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search artists, themes, mediums"
                      />
                    </div>
                    <p className="text-sm text-muted whitespace-nowrap">
                      {dataReady ? (
                        <>
                          {filteredArtists.length} artist
                          {filteredArtists.length !== 1 ? "s" : ""}
                          {(hasActiveFilters || searchQuery) && " matching"}
                        </>
                      ) : (
                        "…"
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* View toggle, Galleries first since that's the
                        default landing view (#4) and matches the new
                        nav order. */}
                    <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5 mr-1">
                      <button type="button" onClick={() => { switchView("gallery"); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "works" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Galleries
                      </button>
                      <button type="button" onClick={() => { switchView("portfolios"); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "artists" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Portfolios
                      </button>
                      <button type="button" onClick={() => switchView("collections")} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline === "collections" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Collections
                      </button>
                    </div>
                    {/* Compact / grid icon */}
                    <button
                      type="button"
                      title="Compact view"
                      onClick={() => setViewMode("compact")}
                      className={`p-1.5 rounded-sm border transition-colors duration-150 cursor-pointer ${
                        viewMode === "compact"
                          ? "bg-foreground text-background border-foreground"
                          : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="0" y="0" width="6" height="6" rx="0.5" />
                        <rect x="8" y="0" width="6" height="6" rx="0.5" />
                        <rect x="0" y="8" width="6" height="6" rx="0.5" />
                        <rect x="8" y="8" width="6" height="6" rx="0.5" />
                      </svg>
                    </button>
                    {/* Expanded / list icon */}
                    <button
                      type="button"
                      title="Expanded view"
                      onClick={() => setViewMode("expanded")}
                      className={`p-1.5 rounded-sm border transition-colors duration-150 cursor-pointer ${
                        viewMode === "expanded"
                          ? "bg-foreground text-background border-foreground"
                          : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="0" y="0" width="14" height="4" rx="0.5" />
                        <rect x="0" y="5" width="14" height="4" rx="0.5" />
                        <rect x="0" y="10" width="14" height="4" rx="0.5" />
                      </svg>
                    </button>
                    {/* Sort */}
                    <select
                      value={artistSort}
                      onChange={(e) => setArtistSort(e.target.value as typeof artistSort)}
                      className="px-2.5 py-1.5 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer focus:outline-none focus:border-accent/50"
                    >
                      <option value="featured">Sort: Featured</option>
                      <option value="name">Sort: A-Z</option>
                      <option value="revenue_share">Sort: Revenue Share %</option>
                      <option value="distance" disabled={!userCoords}>
                        Sort: Nearest{userCoords ? "" : " (enable location)"}
                      </option>
                    </select>
                  </div>
                </div>

                {filteredArtists.length === 0 ? (
                  <div className="py-20 text-center">
                    {filters.mode === "local" && !userCoords ? (
                      <>
                        <p className="text-muted mb-2">Enter your postcode in the filter panel</p>
                        <p className="text-sm text-muted/60">to find artists near you</p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted mb-4">No artists match these filters.</p>
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-sm text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                        >
                          Clear filters
                        </button>
                      </>
                    )}
                  </div>
                ) : viewMode === "compact" ? (
                  <div className={`grid ${mobileGrid === 2 ? "grid-cols-2" : "grid-cols-1"} sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5`}>
                    {filteredArtists.slice(0, loadedArtists).map((artist) => {
                      const distance =
                        userCoords && artist.coordinates
                          ? calcDistance(
                              userCoords.lat,
                              userCoords.lng,
                              artist.coordinates.lat,
                              artist.coordinates.lng
                            )
                          : null;
                      return <BrowseArtistCard key={artist.slug} artist={artist} distance={distance} />;
                    })}
                  </div>
                ) : (
                  /* Expanded view */
                  <div className="divide-y divide-border">
                    {filteredArtists.slice(0, loadedArtists).map((artist) => (
                      <div
                        key={artist.slug}
                        className="flex gap-6 items-start py-6"
                      >
                        {/* Left: artist info */}
                        <div className="w-48 shrink-0">
                          <Link href={`/browse/${artist.slug}`} className="block group">
                            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-border/30 mb-3">
                              <Image
                                src={
                                  artist.image ||
                                  `https://picsum.photos/seed/${artist.slug}/200/200`
                                }
                                alt={artist.name}
                                fill
                                className="object-cover group-hover:scale-[1.05] transition-transform duration-300"
                                sizes="64px"
                              />
                            </div>
                            <h3 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors duration-150 leading-tight mb-1">
                              {artist.name}
                            </h3>
                          </Link>
                          <p className="text-xs text-muted mb-2">
                            {disciplineLabel(artist.primaryMedium, artist.discipline)} &middot; {artist.location}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {artist.styleTags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-block px-1.5 py-0.5 text-[10px] text-muted bg-background border border-border rounded-sm"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Right: horizontal scroll of works */}
                        <div className="flex-1 overflow-x-auto">
                          <div className="flex gap-3">
                            {artist.works.slice(0, 6).map((work) => (
                              <Link
                                key={work.title}
                                href={`/browse/${artist.slug}`}
                                className="group block w-40 shrink-0"
                              >
                                <div className="aspect-[4/5] relative overflow-hidden rounded-sm bg-border/30">
                                  <Image
                                    src={
                                      work.image ||
                                      `https://picsum.photos/seed/${artist.slug}-${work.title}/200/250`
                                    }
                                    alt={work.title}
                                    fill
                                    className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                    sizes="160px"
                                  />
                                </div>
                                <p className="text-xs text-muted mt-1 truncate">
                                  {work.title}
                                </p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Load more, only render when there's more than the
                    currently-loaded slice to show. */}
                {filteredArtists.length > loadedArtists && (
                  <div className="mt-10 text-center">
                    <button
                      type="button"
                      onClick={() => setLoadedArtists((n) => n + PAGE_SIZE)}
                      className="px-6 py-2.5 text-sm font-medium text-foreground border border-foreground/30 rounded-sm hover:border-foreground hover:bg-surface transition-colors cursor-pointer"
                    >
                      Show {Math.min(PAGE_SIZE, filteredArtists.length - loadedArtists)} more
                    </button>
                    <p className="text-xs text-muted mt-2">
                      Showing {loadedArtists} of {filteredArtists.length}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeDiscipline !== "collections" && viewAs === "works" && (
        /* ── Gallery mode with sidebar ── */
        <section className="pt-5 pb-10 lg:pt-8 lg:pb-14">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="flex gap-10 lg:gap-14 items-start">
              {/* Sidebar – desktop */}
              <aside className="hidden lg:block w-56 shrink-0 sticky top-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium text-foreground">Filters</span>
                  {hasGalleryFilters && (
                    <button type="button" onClick={clearGalleryFilters} className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer">
                      Clear all
                    </button>
                  )}
                </div>
                <div className="space-y-7">
                  {/* Location (#9), toggle removed; the slider is the
                      only control. Postcode entry shows when no location
                      is set; slider shows once it is. */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Location</p>
                    {userCoords && (
                      <div>
                        <DistanceSliderControl
                          value={maxDistance}
                          onCommit={setMaxDistance}
                          labelClassName="text-xs text-muted mb-2"
                          withNumberInput
                          numberInputRowClassName="flex items-center justify-between gap-2"
                          numberInputSuffix={
                            <button
                              type="button"
                              onClick={() => { clearLocation(); setPostcodeError(false); }}
                              className="text-[11px] text-muted underline hover:text-foreground"
                            >
                              Change postcode
                            </button>
                          }
                        />
                      </div>
                    )}
                    {!userCoords && !geoRequesting && (
                      <div>
                        <p className="text-xs text-muted mb-1.5">Enter your postcode to filter by distance</p>
                        <PostcodeInput
                          initial={postcodeInput}
                          onGeocoded={(coords, pc) => {
                            updateLocationCoords(coords, pc);
                            setPostcodeError(false);
                          }}
                          onError={(failed) => setPostcodeError(failed)}
                        />
                        {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                      </div>
                    )}
                  </div>

                  {/* Arrangement, three independent toggles matching the
                      portfolio filter bar (Revenue Share / Paid Loan /
                      Direct Purchase). Rev share slider appears under the
                      Revenue Share tile when active. */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Arrangement</p>
                    <div className="space-y-2">
                      {/* Revenue Share */}
                      <button
                        type="button"
                        onClick={() => setGalleryRevenueShare(!galleryRevenueShare)}
                        aria-pressed={galleryRevenueShare}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                          galleryRevenueShare ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={galleryRevenueShare ? "text-accent" : "text-muted"}>
                          <path d="m11 17 2 2a1 1 0 1 0 3-3" />
                          <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
                          <path d="m21 3 1 11h-2" />
                          <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
                          <path d="M3 4h8" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Revenue Share</p>
                          <p className="text-[10px] text-muted">Free on wall, split on QR sales</p>
                        </div>
                      </button>
                      {galleryRevenueShare && (
                        <div className="pl-3 pr-1 pb-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-muted">Minimum share</span>
                            <span className="text-[11px] font-medium text-foreground">
                              {galleryRevenueShareMin > 0 ? `${galleryRevenueShareMin}%` : "Any"}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={50}
                            step={1}
                            value={galleryRevenueShareMin}
                            onChange={(e) => setGalleryRevenueShareMin(Number(e.target.value) || 0)}
                            className="w-full accent-accent h-1 cursor-pointer"
                            aria-label="Minimum revenue share"
                          />
                          <div className="flex justify-between text-[9px] text-muted mt-0.5">
                            <span>0%</span><span>25%</span><span>50%</span>
                          </div>
                        </div>
                      )}

                      {/* Paid Loan */}
                      <button
                        type="button"
                        onClick={() => setGalleryFreeLoan(!galleryFreeLoan)}
                        aria-pressed={galleryFreeLoan}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                          galleryFreeLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        <span className={`text-base font-serif font-semibold leading-none w-4 text-center ${galleryFreeLoan ? "text-accent" : "text-muted"}`}>&pound;</span>
                        <div>
                          <p className="text-sm font-medium">Paid Loan</p>
                          <p className="text-[10px] text-muted">Monthly fee to display the work</p>
                        </div>
                      </button>

                      {/* Direct Purchase */}
                      <button
                        type="button"
                        onClick={() => setGalleryPurchase(!galleryPurchase)}
                        aria-pressed={galleryPurchase}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                          galleryPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryPurchase ? "text-accent" : "text-muted"}>
                          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Direct Purchase</p>
                          <p className="text-[10px] text-muted">Buy artwork outright</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Availability */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Availability</p>
                    <div className="space-y-1.5">
                      <CheckPill checked={galleryOriginals} onChange={setGalleryOriginals} label="Originals available" />
                      <CheckPill checked={galleryPrints} onChange={setGalleryPrints} label="Prints available" />
                      <CheckPill checked={galleryFraming} onChange={setGalleryFraming} label="Framing available" />
                    </div>
                  </div>

                  {/* Size band (#7), tighter pills than before per UX
                      pass: smaller padding, smaller label so the row
                      doesn't dominate the panel. */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Size</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SIZE_BANDS.map((b) => {
                        const active = gallerySizes.has(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => toggleSize(b.id)}
                            className={`px-2 py-1.5 rounded-sm border text-left transition-colors ${
                              active ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                            }`}
                          >
                            <span className="flex flex-col items-start gap-0.5">
                              <span className="text-[11px] font-medium leading-tight">{b.label}</span>
                              <span className="text-[9px] text-muted leading-tight tabular-nums">{b.sub}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Price Range */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
                      Price: £{galleryPriceMin} to {galleryPriceMax >= 1000 ? "£1000+" : `£${galleryPriceMax}`}
                    </p>
                    <div className="space-y-3 px-1">
                      <div>
                        <label className="text-[10px] text-muted">Min</label>
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMin} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMin(Math.min(v, galleryPriceMax)); }} className="w-full accent-accent h-1.5 cursor-pointer" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted">Max</label>
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMax} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMax(Math.max(v, galleryPriceMin)); }} className="w-full accent-accent h-1.5 cursor-pointer" />
                      </div>
                    </div>
                  </div>

                  {/* Style + Theme moved to the bottom, less
                      actionable than location / arrangement /
                      availability / size / price for buyers, so
                      they sit below the high-priority filters. */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Style</p>
                    <select value={galleryStyle} onChange={(e) => setGalleryStyle(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer">
                      <option value="">All styles</option>
                      {allMediums.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Theme</p>
                    <select value={galleryTheme} onChange={(e) => setGalleryTheme(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer">
                      <option value="">All themes</option>
                      {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {dataReady
                      ? `${filteredGalleryWorks.length} work${filteredGalleryWorks.length !== 1 ? "s" : ""}`
                      : "…"}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* View dropdown (mobile, pill-shaped native select) */}
                    <div className="relative">
                      <select
                        value={activeDiscipline === "collections" ? "collections" : ((viewAs as string) === "works" ? "gallery" : "portfolios")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "collections") switchView("collections");
                          else if (v === "gallery") switchView("gallery");
                          else switchView("portfolios");
                        }}
                        className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                      >
                        <option value="gallery">Galleries</option>
                        <option value="portfolios">Portfolios</option>
                        <option value="collections">Collections</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <polyline points="2 4 6 8 10 4" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-sm text-sm text-foreground hover:bg-surface transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="16" y2="12" /><line x1="4" y1="17" x2="12" y2="17" /></svg>
                      Filters
                      {hasGalleryFilters && <span className="text-xs text-white bg-accent rounded-full w-4 h-4 flex items-center justify-center">!</span>}
                    </button>
                  </div>
                </div>

                {/* Mobile filter drawer */}
                {sidebarOpen && activeDiscipline !== "collections" && viewAs === "works" && (
                  <div className="lg:hidden mb-6 bg-surface border border-border rounded-sm p-4 space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Filters</span>
                      <button type="button" onClick={() => setSidebarOpen(false)} className="text-xs text-muted hover:text-foreground cursor-pointer">Close</button>
                    </div>
                    {/* Location, toggle removed (#9). Distance slider when
                        a location is set, postcode input + Use-my-location
                        when not. */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Location</p>
                      {geoRequesting && (
                        <p className="text-xs text-muted animate-pulse">Detecting your location…</p>
                      )}
                      {!geoRequesting && userCoords && (
                        <>
                          <p className="text-xs text-accent flex items-center gap-1.5 mb-3">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1.5 5 4 7.5 8.5 2.5" />
                            </svg>
                            Location set
                            <button
                              type="button"
                              onClick={() => { clearLocation(); setPostcodeError(false); }}
                              className="ml-1 text-[10px] text-muted underline cursor-pointer"
                            >
                              change
                            </button>
                          </p>
                          <DistanceSliderControl
                            value={maxDistance}
                            onCommit={setMaxDistance}
                            labelClassName="text-[10px] text-muted mb-1.5"
                          />
                        </>
                      )}
                      {!userCoords && !geoRequesting && (
                        <div>
                          <p className="text-[10px] text-muted mb-1.5">Enter your postcode to filter by distance</p>
                          <PostcodeInput
                            initial={postcodeInput}
                            onGeocoded={(coords, pc) => {
                              updateLocationCoords(coords, pc);
                              setPostcodeError(false);
                            }}
                            onError={(failed) => setPostcodeError(failed)}
                          />
                          {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Arrangement</p>
                      <div className="space-y-2">
                        {/* Revenue Share */}
                        <button
                          type="button"
                          onClick={() => setGalleryRevenueShare(!galleryRevenueShare)}
                          aria-pressed={galleryRevenueShare}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm border text-left transition-colors ${
                            galleryRevenueShare ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={galleryRevenueShare ? "text-accent" : "text-muted"}>
                            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
                            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
                            <path d="m21 3 1 11h-2" />
                            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
                            <path d="M3 4h8" />
                          </svg>
                          <div>
                            <p className="text-xs font-medium">Revenue Share</p>
                            <p className="text-[10px] text-muted">Free on wall, split on QR sales</p>
                          </div>
                        </button>
                        {galleryRevenueShare && (
                          <div className="flex items-center gap-2 pl-3 py-0.5">
                            <span className="text-[10px] text-muted">Min rev share</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={galleryRevenueShareMin === 0 ? "" : galleryRevenueShareMin}
                              onChange={(e) => setGalleryRevenueShareMin(e.target.value === "" ? 0 : Number(e.target.value))}
                              placeholder="Any"
                              className="w-14 px-2 py-1 bg-surface border border-border rounded-sm text-xs text-foreground text-center focus:outline-none focus:border-accent/50"
                              aria-label="Minimum revenue share"
                            />
                            <span className="text-[10px] text-muted">%</span>
                          </div>
                        )}

                        {/* Paid Loan */}
                        <button
                          type="button"
                          onClick={() => setGalleryFreeLoan(!galleryFreeLoan)}
                          aria-pressed={galleryFreeLoan}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm border text-left transition-colors ${
                            galleryFreeLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                          }`}
                        >
                          <span className={`text-base font-serif font-semibold leading-none w-4 text-center ${galleryFreeLoan ? "text-accent" : "text-muted"}`}>&pound;</span>
                          <div>
                            <p className="text-xs font-medium">Paid Loan</p>
                            <p className="text-[10px] text-muted">Monthly fee to display the work</p>
                          </div>
                        </button>

                        {/* Direct Purchase */}
                        <button
                          type="button"
                          onClick={() => setGalleryPurchase(!galleryPurchase)}
                          aria-pressed={galleryPurchase}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm border text-left transition-colors ${
                            galleryPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryPurchase ? "text-accent" : "text-muted"}>
                            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                          </svg>
                          <div>
                            <p className="text-xs font-medium">Direct Purchase</p>
                            <p className="text-[10px] text-muted">Buy artwork outright</p>
                          </div>
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Availability</p>
                      <div className="space-y-1.5">
                        <CheckPill checked={galleryOriginals} onChange={setGalleryOriginals} label="Originals" />
                        <CheckPill checked={galleryPrints} onChange={setGalleryPrints} label="Prints" />
                        <CheckPill checked={galleryFraming} onChange={setGalleryFraming} label="Framing" />
                      </div>
                    </div>
                    {/* Size band, tight pills (smaller than the
                        original mobile copy). */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Size</p>
                      <div className="grid grid-cols-2 gap-1">
                        {SIZE_BANDS.map((b) => {
                          const active = gallerySizes.has(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => toggleSize(b.id)}
                              className={`px-2 py-1 rounded-sm border text-left transition-colors ${
                                active ? "border-accent bg-accent/5 text-foreground" : "border-border bg-white text-muted hover:border-foreground/30"
                              }`}
                            >
                              <p className="text-[11px] font-medium leading-tight">{b.label}</p>
                              <p className="text-[9px] text-muted leading-tight">{b.sub}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">
                        Price: £{galleryPriceMin} to {galleryPriceMax >= 1000 ? "£1000+" : `£${galleryPriceMax}`}
                      </p>
                      <div className="space-y-2 px-1">
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMin} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMin(Math.min(v, galleryPriceMax)); }} className="w-full accent-accent h-1.5" />
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMax} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMax(Math.max(v, galleryPriceMin)); }} className="w-full accent-accent h-1.5" />
                      </div>
                    </div>
                    {/* Style + Theme moved to the bottom. */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Style</p>
                      <select value={galleryStyle} onChange={(e) => setGalleryStyle(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm">
                        <option value="">All styles</option>
                        {allMediums.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Theme</p>
                      <select value={galleryTheme} onChange={(e) => setGalleryTheme(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm">
                        <option value="">All themes</option>
                        {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {hasGalleryFilters && (
                      <button type="button" onClick={clearGalleryFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                    )}
                  </div>
                )}

                {/* Search + count + toggle – desktop */}
                <div className="hidden lg:flex items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-64">
                      <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search works, artists, mediums"
                      />
                    </div>
                    <p className="text-sm text-muted whitespace-nowrap">
                      {dataReady
                        ? `${filteredGalleryWorks.length} work${filteredGalleryWorks.length !== 1 ? "s" : ""}`
                        : "…"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5 mr-1">
                      <button type="button" onClick={() => { switchView("gallery"); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "works" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Galleries
                      </button>
                      <button type="button" onClick={() => { switchView("portfolios"); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "artists" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Portfolios
                      </button>
                      <button type="button" onClick={() => switchView("collections")} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline === "collections" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Collections
                      </button>
                    </div>
                    <select
                      value={gallerySort}
                      onChange={(e) => setGallerySort(e.target.value as typeof gallerySort)}
                      className="px-2.5 py-1.5 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer focus:outline-none focus:border-accent/50"
                    >
                      <option value="featured">Sort: Featured</option>
                      <option value="recent">Sort: Recently listed</option>
                      <option value="az">Sort: A-Z</option>
                      <option value="price_low">Sort: Price (low to high)</option>
                      <option value="price_high">Sort: Price (high to low)</option>
                      <option value="revenue_share">Sort: Revenue Share %</option>
                      <option value="distance" disabled={!userCoords}>
                        Sort: Nearest{userCoords ? "" : " (enable location)"}
                      </option>
                    </select>
                  </div>
                </div>

                {filteredGalleryWorks.length === 0 ? (
                  <div className="py-24 text-center">
                    <p className="text-muted text-lg mb-4">No works match these filters.</p>
                    <button type="button" onClick={clearGalleryFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                  </div>
                ) : (() => {
                  // Distribute row-major into N columns so the visual reading
                  // order matches the sort. Each column is a flex stack with
                  // no fixed row height, shorter cards don't leave whitespace.
                  const visibleWorks = filteredGalleryWorks.slice(0, loadedWorks);
                  const masonryCols: typeof visibleWorks[] = Array.from({ length: galleryColCount }, () => []);
                  visibleWorks.forEach((w, i) => masonryCols[i % galleryColCount].push(w));
                  return (
                    <div className="flex gap-5 items-start">
                      {masonryCols.map((colItems, ci) => (
                        <div key={ci} className="flex-1 min-w-0 flex flex-col gap-5">
                          {colItems.map((work) => {
                    const workSlug = slugify(work.title);
                    // ArtistProfileClient opens the lightbox when ?work= is present,
                    // so we route quick-look through the query param rather than a
                    // hash (which only scrolled to the anchor without opening the modal).
                    const quickLookHref = `/browse/${work.artistSlug}?work=${workSlug}`;
                    const fullPageHref = `/browse/${work.artistSlug}/${workSlug}`;
                    const workDistance = userCoords && work.artistCoordinates
                      ? calcDistance(userCoords.lat, userCoords.lng, work.artistCoordinates.lat, work.artistCoordinates.lng)
                      : null;
                    return (
                      <div key={work.id} className="group block">
                        <div className="bg-surface border border-border/50 rounded-lg overflow-hidden flex flex-col">
                          {/* Image */}
                          <div
                            className="relative overflow-hidden rounded-t-lg select-none"
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            {/* Clicking the image opens the full artwork page in a new tab.
                                The hover "eye" icon still triggers quick-look on the same tab. */}
                            <a href={fullPageHref} target="_blank" rel="noopener noreferrer" aria-label={`Open ${work.title} in new tab`} className="block">
                              <ArtworkThumb
                                src={work.image}
                                alt={work.title}
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                imageClassName="group-hover:scale-[1.03] transition-transform duration-700"
                              />
                            </a>
                            {!work.available && (
                              <span className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/70 text-white text-[10px] rounded-sm backdrop-blur-sm">
                                Sold
                              </span>
                            )}
                            {/* Hover action buttons */}
                            {/* Plan G #11: hover-revealed save heart on
                                desktop, always-visible on mobile (since
                                hover doesn't fire on touch). SaveButton
                                handles the auth gate + toast. */}
                            <div className="absolute top-3 left-3 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
                              <SaveButton type="work" itemId={work.id} size="sm" />
                            </div>
                            <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <Link
                                href={quickLookHref}
                                aria-label="Quick look"
                                title="Quick look"
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white hover:text-accent shadow-sm backdrop-blur-sm transition-colors"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </Link>
                              <Link
                                href={fullPageHref}
                                aria-label="Open full artwork page"
                                title="Open full artwork page"
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white hover:text-accent shadow-sm backdrop-blur-sm transition-colors"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M15 3h6v6" />
                                  <path d="M10 14 21 3" />
                                  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                                </svg>
                              </Link>
                            </div>
                          </div>

                          {/* Info — type sized down a notch per design
                              feedback. Distance from you sits on the
                              right of the title row on web; on mobile it
                              wraps below to keep the title readable. */}
                          <div className="px-4 py-3 flex-1 flex flex-col">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <a href={fullPageHref} target="_blank" rel="noopener noreferrer" className="block group/title min-w-0 flex-1">
                                <h3 className="text-[13px] font-medium text-foreground leading-tight group-hover/title:text-accent transition-colors truncate">
                                  {work.title}
                                </h3>
                              </a>
                              {workDistance !== null && (
                                <span className="text-[10px] text-muted shrink-0 inline-flex items-center gap-0.5 order-3 sm:order-none w-full sm:w-auto mt-0.5 sm:mt-0">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {workDistance < 0.2 ? "< 0.2 mi" : `${workDistance.toFixed(1)} mi`}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted mt-0.5">
                              <Link
                                href={`/browse/${work.artistSlug}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-accent hover:underline transition-colors"
                              >
                                {work.artistName}
                              </Link>
                              {" · "}
                              {work.medium}
                            </p>
                            <p className="text-[11px] text-foreground/80 mt-1 font-medium">
                              {work.priceBand}
                            </p>
                            <p className="text-[11px] text-muted/70 mt-1">
                              {[work.openToFreeLoan ? "Display" : "", work.openToOutrightPurchase ? "Purchase" : ""].filter(Boolean).join(" · ")}
                            </p>
                            {work.openToRevenueShare && work.revenueSharePercent != null && work.revenueSharePercent > 0 && (
                              <p className="text-[11px] text-accent font-medium mt-1">
                                {work.revenueSharePercent}% Revenue Share
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {filteredGalleryWorks.length > loadedWorks && (
                  <div className="mt-10 text-center">
                    <button
                      type="button"
                      onClick={() => setLoadedWorks((n) => n + PAGE_SIZE)}
                      className="px-6 py-2.5 text-sm font-medium text-foreground border border-foreground/30 rounded-sm hover:border-foreground hover:bg-surface transition-colors cursor-pointer"
                    >
                      Show {Math.min(PAGE_SIZE, filteredGalleryWorks.length - loadedWorks)} more
                    </button>
                    <p className="text-xs text-muted mt-2">
                      Showing {loadedWorks} of {filteredGalleryWorks.length}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeDiscipline === "collections" && (() => {
        // Sidebar filter panel reused on desktop sidebar + mobile drawer
        // so collections matches the galleries/portfolios layout pattern.
        const collectionsFilterPanel = (
          <div className="space-y-7">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Location</p>
              {geoRequesting && (
                <p className="text-xs text-muted animate-pulse">Detecting your location…</p>
              )}
              {!geoRequesting && userCoords && (
                <DistanceSliderControl
                  value={maxDistance}
                  onCommit={setMaxDistance}
                  labelClassName="text-xs text-muted mb-2"
                  withNumberInput
                  numberInputRowClassName="flex items-center justify-between gap-2"
                  numberInputSuffix={
                    <button
                      type="button"
                      onClick={() => { clearLocation(); setPostcodeError(false); }}
                      className="text-[11px] text-muted underline hover:text-foreground"
                    >
                      Change postcode
                    </button>
                  }
                />
              )}
              {!userCoords && !geoRequesting && (
                <div>
                  <p className="text-xs text-muted mb-1.5">Enter your postcode to filter by distance</p>
                  <PostcodeInput
                    initial={postcodeInput}
                    onGeocoded={(coords, pc) => {
                      updateLocationCoords(coords, pc);
                      setPostcodeError(false);
                    }}
                    onError={(failed) => setPostcodeError(failed)}
                  />
                  {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Arrangement</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setCollectionsRevShare(!collectionsRevShare)}
                  aria-pressed={collectionsRevShare}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                    collectionsRevShare ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={collectionsRevShare ? "text-accent" : "text-muted"}>
                    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
                    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
                    <path d="m21 3 1 11h-2" />
                    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
                    <path d="M3 4h8" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium">Revenue Share</p>
                    <p className="text-[10px] text-muted">Free on wall, split on QR sales</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionsFreeLoan(!collectionsFreeLoan)}
                  aria-pressed={collectionsFreeLoan}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                    collectionsFreeLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                  }`}
                >
                  <span className={`text-base font-serif font-semibold leading-none w-4 text-center ${collectionsFreeLoan ? "text-accent" : "text-muted"}`}>&pound;</span>
                  <div>
                    <p className="text-sm font-medium">Paid Loan</p>
                    <p className="text-[10px] text-muted">Monthly fee to display the work</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionsPurchase(!collectionsPurchase)}
                  aria-pressed={collectionsPurchase}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                    collectionsPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={collectionsPurchase ? "text-accent" : "text-muted"}>
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium">Direct Purchase</p>
                    <p className="text-[10px] text-muted">Buy artwork outright</p>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
                Bundle price: £{collectionsPriceMin} {collectionsPriceMax >= 2000 ? "and £2000+" : `and £${collectionsPriceMax}`}
              </p>
              <div className="space-y-3 px-1">
                <div>
                  <label className="text-[10px] text-muted">Min</label>
                  <input type="range" min={0} max={2000} step={50} value={collectionsPriceMin} onChange={(e) => { const v = Number(e.target.value); setCollectionsPriceMin(Math.min(v, collectionsPriceMax)); }} className="w-full accent-accent h-1.5 cursor-pointer" />
                </div>
                <div>
                  <label className="text-[10px] text-muted">Max</label>
                  <input type="range" min={0} max={2000} step={50} value={collectionsPriceMax} onChange={(e) => { const v = Number(e.target.value); setCollectionsPriceMax(Math.max(v, collectionsPriceMin)); }} className="w-full accent-accent h-1.5 cursor-pointer" />
                </div>
              </div>
            </div>
          </div>
        );

        return (
        <section className="pt-5 pb-10 lg:pt-8 lg:pb-14">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="mb-6">
              <h2 className="text-2xl font-serif mb-1">Curated Collections</h2>
              <p className="text-sm text-muted">Themed bundles of artwork at a set price. Ready to transform your space.</p>
            </div>
            <div className="flex gap-10 lg:gap-14 items-start">
              {/* Sidebar – desktop */}
              <aside className="hidden lg:block w-56 shrink-0 sticky top-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium text-foreground">Filters</span>
                  {hasCollectionsFilters && (
                    <button type="button" onClick={clearCollectionsFilters} className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer">
                      Clear all
                    </button>
                  )}
                </div>
                {collectionsFilterPanel}
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {dataReady
                      ? `${filteredCollections.length} collection${filteredCollections.length !== 1 ? "s" : ""}`
                      : "…"}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value="collections"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "gallery") switchView("gallery");
                          else if (v === "portfolios") switchView("portfolios");
                        }}
                        className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                      >
                        <option value="gallery">Galleries</option>
                        <option value="portfolios">Portfolios</option>
                        <option value="collections">Collections</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <polyline points="2 4 6 8 10 4" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-sm text-sm text-foreground hover:bg-surface transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="16" y2="12" /><line x1="4" y1="17" x2="12" y2="17" /></svg>
                      Filters
                      {hasCollectionsFilters && <span className="text-xs text-white bg-accent rounded-full w-4 h-4 flex items-center justify-center">!</span>}
                    </button>
                  </div>
                </div>

                {/* Mobile filter drawer */}
                {sidebarOpen && (
                  <div className="lg:hidden mb-6 bg-surface border border-border rounded-sm p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium">Filters</span>
                      <button type="button" onClick={() => setSidebarOpen(false)} className="text-xs text-muted hover:text-foreground cursor-pointer">Close</button>
                    </div>
                    {collectionsFilterPanel}
                    {hasCollectionsFilters && (
                      <button type="button" onClick={clearCollectionsFilters} className="mt-4 text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                    )}
                  </div>
                )}

                {/* Search + count + view toggle – desktop */}
                <div className="hidden lg:flex items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-64">
                      <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search collections, artists"
                      />
                    </div>
                    <p className="text-sm text-muted whitespace-nowrap">
                      {dataReady
                        ? `${filteredCollections.length} collection${filteredCollections.length !== 1 ? "s" : ""}`
                        : "…"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5 mr-1">
                      <button type="button" onClick={() => switchView("gallery")} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer text-muted hover:text-foreground">
                        Galleries
                      </button>
                      <button type="button" onClick={() => switchView("portfolios")} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer text-muted hover:text-foreground">
                        Portfolios
                      </button>
                      <button type="button" onClick={() => switchView("collections")} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer bg-white text-foreground shadow-sm">
                        Collections
                      </button>
                    </div>
                  </div>
                </div>

                {filteredCollections.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                      {filteredCollections.slice(0, loadedCollections).map((col) => {
                        const collectionArtist = artists.find((a) => a.slug === col.artistSlug);
                        const colDistance = userCoords && collectionArtist?.coordinates
                          ? calcDistance(userCoords.lat, userCoords.lng, collectionArtist.coordinates.lat, collectionArtist.coordinates.lng)
                          : null;
                        return <CollectionCard key={col.id} collection={col} distance={colDistance} />;
                      })}
                    </div>
                    {filteredCollections.length > loadedCollections && (
                      <div className="mt-10 text-center">
                        <button
                          type="button"
                          onClick={() => setLoadedCollections((n) => n + PAGE_SIZE)}
                          className="px-6 py-2.5 text-sm font-medium text-foreground border border-foreground/30 rounded-sm hover:border-foreground hover:bg-surface transition-colors cursor-pointer"
                        >
                          Show {Math.min(PAGE_SIZE, filteredCollections.length - loadedCollections)} more
                        </button>
                        <p className="text-xs text-muted mt-2">
                          Showing {loadedCollections} of {filteredCollections.length}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-20 text-center">
                    <p className="text-muted mb-3">
                      {collections.filter((c) => c.available).length === 0
                        ? "No collections available yet."
                        : "No collections match these filters."}
                    </p>
                    {hasCollectionsFilters && (
                      <button type="button" onClick={clearCollectionsFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        );
      })()}

      {/* Subscription CTA for logged-in artists who haven't subscribed.
          The component is a noop for everyone else (loading, anonymous,
          venues, customers, already-subscribed), so it lives inline. */}
      <section className="px-6">
        <div className="max-w-[1400px] mx-auto pb-6">
          <SubscriptionUpsellBanner variant="compact" />
        </div>
      </section>

      {/* CTAs */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-surface border border-border rounded-sm p-8 lg:p-10">
              <h2 className="text-2xl mb-3">Are you an artist?</h2>
              <p className="text-muted leading-relaxed mb-6">
                We are always looking for talented artists to
                join our curated roster. Apply today and get your work seen in
                venues across the UK.
              </p>
              <Button href="/apply" variant="primary" size="md">
                Apply to Join Wallplace
              </Button>
            </div>
            <div className="bg-surface border border-border rounded-sm p-8 lg:p-10">
              <h2 className="text-2xl mb-3">Looking for art?</h2>
              <p className="text-muted leading-relaxed mb-6">
                Whether you run a café, restaurant, coworking space, or office,
                we can help you find the right artwork for your walls.
              </p>
              <Button href="/signup/venue" variant="secondary" size="md">
                Register Your Venue
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
