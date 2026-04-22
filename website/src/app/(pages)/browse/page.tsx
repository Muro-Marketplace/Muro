"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { artists as staticArtists, type Artist } from "@/data/artists";
import { themes } from "@/data/themes";
import { artistsToGalleryWorks } from "@/data/galleries";
import { collections as staticCollections, type ArtistCollection } from "@/data/collections";
import { DISCIPLINES, formatSubStyleLabel, getDisciplineById, resolveDiscipline, disciplineLabel } from "@/data/categories";
import { slugify } from "@/lib/slugify";
import { geocodePostcode } from "@/lib/geocode";
import Button from "@/components/Button";
import BrowseArtistCard from "@/components/BrowseArtistCard";
import CollectionCard from "@/components/CollectionCard";
import SearchBar from "@/components/SearchBar";

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
  maxDistance: number;
  themes: string[];
  originals: boolean;
  prints: boolean;
  framing: boolean;
  // Three arrangement filters — independent toggles. Revenue share applies a
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
  mode: "global",
  maxDistance: 25,
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
  //   - "collections" — sentinel for the Collections view (kept for back-compat
  //     with the existing view-switcher buttons and ?view=collections param).
  const [activeDiscipline, setActiveDiscipline] = useState<string>("");
  const [activeSubStyles, setActiveSubStyles] = useState<Set<string>>(new Set());
  const [viewAs, setViewAs] = useState<"artists" | "works">("artists");
  // Pagination — "Show 20 more" pattern per view.
  const [loadedArtists, setLoadedArtists] = useState(PAGE_SIZE);
  const [loadedWorks, setLoadedWorks] = useState(PAGE_SIZE);
  const [loadedCollections, setLoadedCollections] = useState(PAGE_SIZE);

  // Drive view from ?view= query param (F47). We use searchParams rather than
  // window.location.hash because Next.js Link same-page hash changes use
  // pushState, which doesn't fire hashchange — so the page wouldn't react.
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get("view") || "";
  // Reset pagination when switching views / categories so users don't land
  // on an empty grid if they scroll back to a narrow filter.
  useEffect(() => {
    setLoadedArtists(PAGE_SIZE);
    setLoadedWorks(PAGE_SIZE);
    setLoadedCollections(PAGE_SIZE);
  }, [activeDiscipline, viewAs]);

  useEffect(() => {
    if (viewParam === "collections") {
      setActiveDiscipline("collections");
    } else if (viewParam === "gallery") {
      setActiveDiscipline("");
      setViewAs("works");
    } else if (viewParam === "portfolios") {
      setActiveDiscipline("");
      setViewAs("artists");
    }
  }, [viewParam]);
  const [artistSort, setArtistSort] = useState<"featured" | "name" | "revenue_share" | "distance">("featured");
  const [gallerySort, setGallerySort] = useState<"featured" | "az" | "price_low" | "price_high" | "revenue_share" | "distance">("featured");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [artists, setArtists] = useState<Artist[]>(staticArtists);
  const [collections, setCollections] = useState<ArtistCollection[]>(staticCollections);

  // User location state for Local mode
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoRequesting, setGeoRequesting] = useState(false);
  const [postcodeInput, setPostcodeInput] = useState("");
  const [postcodeError, setPostcodeError] = useState(false);

  // Fetch merged artists (static + database) on mount
  useEffect(() => {
    fetch("/api/browse-artists")
      .then((res) => res.json())
      .then((data) => {
        if (data.artists?.length) {
          setArtists(data.artists);
        }
      })
      .catch(() => { /* keep static data */ });
    fetch("/api/browse-collections")
      .then((res) => res.json())
      .then((data) => {
        const apiCollections: ArtistCollection[] = data.collections || [];
        setCollections(apiCollections);
      })
      .catch(() => { /* keep static data */ });
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
  const [galleryLocationMode, setGalleryLocationMode] = useState<"global" | "local">("global");
  const [galleryStyle, setGalleryStyle] = useState("");
  const [galleryOriginals, setGalleryOriginals] = useState(false);
  const [galleryPrints, setGalleryPrints] = useState(false);
  const [galleryFraming, setGalleryFraming] = useState(false);
  const [galleryFreeLoan, setGalleryFreeLoan] = useState(false);
  const [galleryRevenueShare, setGalleryRevenueShare] = useState(false);
  const [galleryRevenueShareMin, setGalleryRevenueShareMin] = useState(0);
  const [galleryPurchase, setGalleryPurchase] = useState(false);

  // Collections view location filter — independent of artists/gallery so the
  // filter state doesn't bleed across views.
  const [collectionsLocationMode, setCollectionsLocationMode] = useState<"global" | "local">("global");

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

  const clearAll = () => setFilters(DEFAULT_FILTERS);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return; // will fall through to postcode input
    }
    setGeoRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoRequesting(false);
      },
      () => {
        setGeoRequesting(false); // show postcode input
      },
      { timeout: 10000 }
    );
  }, []);

  function handleModeChange(newMode: "local" | "global") {
    setFilter("mode", newMode);
    if (newMode === "local" && !userCoords && !geoRequesting) {
      requestGeolocation();
    }
  }

  async function handlePostcodeSubmit() {
    if (!postcodeInput.trim()) return;
    const coords = await geocodePostcode(postcodeInput);
    if (coords) {
      setUserCoords(coords);
      setPostcodeError(false);
    } else {
      setPostcodeError(true);
    }
  }

  const hasActiveFilters =
    filters.mode === "local" ||
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
    return artists.filter((artist) => {
      // Must have at least one artwork to appear in marketplace
      if (!artist.works || artist.works.length === 0) return false;
      // Discipline filter — fall back to inferring from primary medium
      // so seed artists (without an explicit discipline field) and older
      // DB rows that missed the backfill still match the right category.
      if (activeDisciplineObj) {
        const effective = resolveDiscipline(artist.primaryMedium, artist.discipline);
        if (effective !== activeDisciplineObj.id) return false;
      }
      // Sub-style filter — artist must have at least one of the active sub-styles
      if (activeSubStyles.size > 0 && !artist.subStyles?.some((s) => activeSubStyles.has(s))) return false;

      if (filters.mode === "local") {
        if (!userCoords || !artist.coordinates) return false;
        const dist = calcDistance(
          userCoords.lat,
          userCoords.lng,
          artist.coordinates.lat,
          artist.coordinates.lng
        );
        if (dist > filters.maxDistance) return false;
      }
      if (
        filters.themes.length > 0 &&
        !filters.themes.some((t) => artist.themes.includes(t))
      )
        return false;
      if (filters.originals && !artist.offersOriginals) return false;
      if (filters.prints && !artist.offersPrints) return false;
      if (filters.framing && !artist.offersFramed) return false;
      // Independent arrangement filters — any combination can be active.
      if (filters.revenueShare && !artist.openToRevenueShare) return false;
      if (filters.paidLoan && !artist.openToFreeLoan) return false;
      if (filters.outrightPurchase && !artist.openToOutrightPurchase) return false;
      // Min rev share threshold only applies when Revenue Share is the
      // active arrangement — ignored otherwise.
      if (
        filters.revenueShare &&
        filters.revenueShareMin > 0 &&
        (!artist.revenueSharePercent || artist.revenueSharePercent < filters.revenueShareMin)
      ) {
        return false;
      }
      // Legacy freeLoan URL param still works — matches either Revenue Share
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
      // "featured": founding artists first, then original order
      if (a.isFoundingArtist && !b.isFoundingArtist) return -1;
      if (!a.isFoundingArtist && b.isFoundingArtist) return 1;
      return 0;
    });
  }, [artists, filters, userCoords, activeDisciplineObj, activeSubStyles, artistSort]);

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
    return allGalleryWorks.filter((work) => {
      // Discipline filter
      if (activeDisciplineObj && work.artistDiscipline !== activeDisciplineObj.id) return false;
      // Sub-style filter — work's artist must have at least one matching sub-style
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
      // Commercial terms
      if (galleryFreeLoan && !work.openToFreeLoan) return false;
      if (galleryRevenueShare && !work.openToRevenueShare) return false;
      if (galleryRevenueShare && galleryRevenueShareMin > 0 && (work.revenueSharePercent || 0) < galleryRevenueShareMin) return false;
      if (galleryPurchase && !work.openToOutrightPurchase) return false;
      // Location
      if (galleryLocationMode === "local" && userCoords && work.artistCoordinates) {
        const dist = calcDistance(userCoords.lat, userCoords.lng, work.artistCoordinates.lat, work.artistCoordinates.lng);
        if (dist > filters.maxDistance) return false;
      }
      return true;
    }).sort((a, b) => {
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
      return 0; // "featured": original order
    });
  }, [allGalleryWorks, galleryTheme, galleryMedium, galleryStyle, galleryAvailableOnly, galleryPriceMin, galleryPriceMax, galleryOriginals, galleryPrints, galleryFraming, galleryFreeLoan, galleryRevenueShare, galleryRevenueShareMin, galleryPurchase, galleryLocationMode, userCoords, filters.maxDistance, activeDisciplineObj, activeSubStyles, gallerySort]);

  const hasGalleryFilters =
    !!galleryTheme || !!galleryMedium || !!galleryStyle || galleryAvailableOnly || galleryPriceMin > 0 || galleryPriceMax < 1000 || galleryOriginals || galleryPrints || galleryFraming || galleryFreeLoan || galleryRevenueShare || galleryPurchase || galleryLocationMode === "local";

  // Collections filtered by distance when user has enabled local mode.
  // Artist coordinates are looked up via artistSlug.
  const filteredCollections = useMemo(() => {
    const base = collections.filter((c) => c.available);
    if (collectionsLocationMode !== "local" || !userCoords) return base;
    return base.filter((c) => {
      const artist = artists.find((a) => a.slug === c.artistSlug);
      if (!artist?.coordinates) return false;
      const dist = calcDistance(userCoords.lat, userCoords.lng, artist.coordinates.lat, artist.coordinates.lng);
      return dist <= filters.maxDistance;
    });
  }, [collections, collectionsLocationMode, userCoords, artists, filters.maxDistance]);

  function clearGalleryFilters() {
    setGalleryTheme(""); setGalleryMedium(""); setGalleryStyle(""); setGalleryAvailableOnly(false);
    setGalleryPriceMin(0); setGalleryPriceMax(1000); setGalleryOriginals(false); setGalleryPrints(false); setGalleryFraming(false);
    setGalleryFreeLoan(false); setGalleryRevenueShare(false); setGalleryRevenueShareMin(0); setGalleryPurchase(false);
    setGalleryLocationMode("global");
  }

  const filterPanel = (
    <div className="space-y-7">
      {/* Local / Global */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Location Mode
        </p>
        <div className="flex gap-2">
          {(["global", "local"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={`flex-1 py-2 text-sm rounded-sm border transition-all duration-150 capitalize cursor-pointer ${
                filters.mode === mode
                  ? "bg-foreground text-background border-foreground"
                  : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {filters.mode === "local" && (
          <div className="mt-3 space-y-3">
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
                  onClick={() => { setUserCoords(null); setPostcodeInput(""); setPostcodeError(false); }}
                  className="ml-1 text-[10px] text-muted underline cursor-pointer"
                >
                  change
                </button>
              </p>
            )}
            {!geoRequesting && !userCoords && (
              <div>
                <p className="text-xs text-muted mb-1.5">Enter your postcode</p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={postcodeInput}
                    onChange={(e) => { setPostcodeInput(e.target.value.toUpperCase()); setPostcodeError(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSubmit(); }}
                    placeholder="e.g. EC1A 1BB"
                    className="flex-1 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handlePostcodeSubmit}
                    className="px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    Go
                  </button>
                </div>
                {postcodeError && (
                  <p className="text-[10px] text-red-400 mt-1">Postcode not found, try again</p>
                )}
              </div>
            )}
            {/* Distance — max only, once we have a location (F48) */}
            {userCoords && (
              <div>
                <p className="text-xs text-muted mb-2">
                  Within {filters.maxDistance >= 9999 ? "any distance" : `${filters.maxDistance} mi`}
                </p>
                <div className="space-y-2.5">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={filters.maxDistance >= 9999 ? 200 : filters.maxDistance}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setFilter("maxDistance", v >= 200 ? 9999 : v);
                    }}
                    className="w-full accent-accent h-1.5 cursor-pointer"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={filters.maxDistance >= 9999 ? "" : filters.maxDistance}
                      placeholder="Any"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") { setFilter("maxDistance", 9999); return; }
                        setFilter("maxDistance", Math.max(0, Number(raw) || 0));
                      }}
                      className="w-20 px-2 py-1 text-xs bg-surface border border-border rounded-sm text-foreground focus:outline-none focus:border-accent/50"
                    />
                    <span className="text-xs text-muted">mi</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Arrangement — three independent toggles for the core Wallplace
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
              filters.revenueShare ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={filters.revenueShare ? "text-accent" : "text-muted"}>
              <rect x="5" y="5" width="14" height="14" rx="1.5" /><path d="M9 9h.01M14 9h.01M9 14h.01M14 14h.01" />
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
                step={5}
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
              filters.paidLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={filters.paidLoan ? "text-accent" : "text-muted"}>
              <path d="M12 2v20M17 5H9a3 3 0 000 6h6a3 3 0 010 6H7" />
            </svg>
            <div>
              <p className="text-sm font-medium">Paid Loan</p>
              <p className="text-[10px] text-muted">Monthly fee to display the work</p>
            </div>
          </button>

          {/* Direct Purchase */}
          <button
            type="button"
            onClick={() => setFilter("outrightPurchase", !filters.outrightPurchase)}
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

      {/* Style */}
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

      {/* Themes – dropdown */}
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

      {/* Sub-style pills — only when a discipline is selected */}
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
                but muted — they still let a user clear any active filter. */}
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
              {viewAs === "artists" ? `${filteredArtists.length} artists` : `${filteredGalleryWorks.length} works`}
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
                    {filteredArtists.length} artist
                    {filteredArtists.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* View dropdown (mobile — pill-shaped native select) */}
                    <div className="relative">
                      <select
                        value={activeDiscipline === "collections" ? "collections" : ((viewAs as string) === "works" ? "gallery" : "portfolios")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "collections") setActiveDiscipline("collections");
                          else if (v === "gallery") { setViewAs("works"); setActiveDiscipline(""); }
                          else { setViewAs("artists"); setActiveDiscipline(""); }
                        }}
                        className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                      >
                        <option value="portfolios">Portfolios</option>
                        <option value="gallery">Gallery</option>
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
                    <div className="w-56">
                      <SearchBar variant="light" mode="desktop" placeholder="Search artists..." />
                    </div>
                    <p className="text-sm text-muted whitespace-nowrap">
                      {filteredArtists.length} artist
                      {filteredArtists.length !== 1 ? "s" : ""}
                      {hasActiveFilters && " matching"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Portfolio/Gallery toggle */}
                    <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5 mr-1">
                      <button type="button" onClick={() => { setViewAs("artists"); setActiveDiscipline(""); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "artists" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Portfolios
                      </button>
                      <button type="button" onClick={() => { setViewAs("works"); setActiveDiscipline(""); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "works" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Gallery
                      </button>
                      <button type="button" onClick={() => setActiveDiscipline("collections")} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline === "collections" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
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
                {/* Load more — only render when there's more than the
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
                  {/* Location Mode */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Location Mode</p>
                    <div className="flex gap-2">
                      {(["global", "local"] as const).map((mode) => (
                        <button key={mode} type="button" onClick={() => { setGalleryLocationMode(mode); if (mode === "local" && !userCoords) handleModeChange("local"); }} className={`flex-1 py-2 text-sm rounded-sm border transition-all duration-150 capitalize cursor-pointer ${galleryLocationMode === mode ? "bg-foreground text-background border-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"}`}>
                          {mode}
                        </button>
                      ))}
                    </div>
                    {galleryLocationMode === "local" && userCoords && (
                      <div className="mt-3">
                        <p className="text-xs text-muted mb-2">
                          Within {filters.maxDistance >= 9999 ? "any distance" : `${filters.maxDistance} mi`}
                        </p>
                        <div className="space-y-2.5">
                          <input
                            type="range"
                            min={0}
                            max={200}
                            step={1}
                            value={filters.maxDistance >= 9999 ? 200 : filters.maxDistance}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setFilter("maxDistance", v >= 200 ? 9999 : v);
                            }}
                            className="w-full accent-accent h-1.5 cursor-pointer"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={9999}
                              value={filters.maxDistance >= 9999 ? "" : filters.maxDistance}
                              placeholder="Any"
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") { setFilter("maxDistance", 9999); return; }
                                setFilter("maxDistance", Math.max(0, Number(raw) || 0));
                              }}
                              className="w-20 px-2 py-1 text-xs bg-surface border border-border rounded-sm text-foreground focus:outline-none focus:border-accent/50"
                            />
                            <span className="text-xs text-muted">mi</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {galleryLocationMode === "local" && !userCoords && !geoRequesting && (
                      <div className="mt-3">
                        <p className="text-xs text-muted mb-1.5">Enter your postcode</p>
                        <div className="flex gap-1.5">
                          <input type="text" value={postcodeInput} onChange={(e) => { setPostcodeInput(e.target.value.toUpperCase()); setPostcodeError(false); }} onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSubmit(); }} placeholder="e.g. EC1A 1BB" className="flex-1 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase" />
                          <button type="button" onClick={handlePostcodeSubmit} className="px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer">Go</button>
                        </div>
                        {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                      </div>
                    )}
                  </div>

                  {/* Arrangement */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Arrangement</p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => { setGalleryFreeLoan(!galleryFreeLoan); if (!galleryFreeLoan) setGalleryRevenueShare(true); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                          galleryFreeLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryFreeLoan ? "text-accent" : "text-muted"}>
                          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Display</p>
                          <p className="text-[10px] text-muted">Revenue share or paid loan</p>
                        </div>
                      </button>
                      {galleryFreeLoan && (
                        <div className="flex items-center gap-2 pl-3 py-0.5">
                          <span className="text-[11px] text-muted">Min rev share</span>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={galleryRevenueShareMin === 0 ? "" : galleryRevenueShareMin}
                            onChange={(e) => setGalleryRevenueShareMin(e.target.value === "" ? 0 : Number(e.target.value))}
                            placeholder="Any"
                            className="w-14 px-2 py-1 bg-surface border border-border rounded-sm text-xs text-foreground text-center focus:outline-none focus:border-accent/50"
                          />
                          <span className="text-[11px] text-muted">%</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setGalleryPurchase(!galleryPurchase)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                          galleryPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryPurchase ? "text-accent" : "text-muted"}>
                          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Purchase</p>
                          <p className="text-[10px] text-muted">Buy artwork outright</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Style */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Style</p>
                    <select value={galleryStyle} onChange={(e) => setGalleryStyle(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer">
                      <option value="">All styles</option>
                      {allMediums.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {/* Theme */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Theme</p>
                    <select value={galleryTheme} onChange={(e) => setGalleryTheme(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer">
                      <option value="">All themes</option>
                      {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
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

                  {/* Price Range */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
                      Price: £{galleryPriceMin} – {galleryPriceMax >= 1000 ? "£1000+" : `£${galleryPriceMax}`}
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
                </div>
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {filteredGalleryWorks.length} work{filteredGalleryWorks.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* View dropdown (mobile — pill-shaped native select) */}
                    <div className="relative">
                      <select
                        value={activeDiscipline === "collections" ? "collections" : ((viewAs as string) === "works" ? "gallery" : "portfolios")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "collections") setActiveDiscipline("collections");
                          else if (v === "gallery") { setViewAs("works"); setActiveDiscipline(""); }
                          else { setViewAs("artists"); setActiveDiscipline(""); }
                        }}
                        className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                      >
                        <option value="portfolios">Portfolios</option>
                        <option value="gallery">Gallery</option>
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
                    {/* Location Mode — mirror the desktop sidebar so mobile users
                        can scope to local + adjust distance from the drawer. */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Location</p>
                      <div className="flex gap-2">
                        {(["global", "local"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setGalleryLocationMode(mode); if (mode === "local" && !userCoords) handleModeChange("local"); }}
                            className={`flex-1 py-2 text-sm rounded-sm border transition-colors cursor-pointer capitalize ${
                              galleryLocationMode === mode
                                ? "bg-foreground text-background border-foreground"
                                : "border-border bg-[#F8F6F2] text-muted hover:border-foreground/30"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                      {galleryLocationMode === "local" && geoRequesting && (
                        <p className="text-xs text-muted animate-pulse mt-3">Detecting your location…</p>
                      )}
                      {galleryLocationMode === "local" && !geoRequesting && userCoords && (
                        <p className="text-xs text-accent flex items-center gap-1.5 mt-3">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1.5 5 4 7.5 8.5 2.5" />
                          </svg>
                          Location set
                          <button
                            type="button"
                            onClick={() => { setUserCoords(null); setPostcodeInput(""); setPostcodeError(false); }}
                            className="ml-1 text-[10px] text-muted underline cursor-pointer"
                          >
                            change
                          </button>
                        </p>
                      )}
                      {galleryLocationMode === "local" && userCoords && (
                        <div className="mt-3">
                          <p className="text-[10px] text-muted mb-1.5">
                            Within {filters.maxDistance >= 9999 ? "any distance" : `${filters.maxDistance} mi`}
                          </p>
                          <input
                            type="range"
                            min={0}
                            max={200}
                            step={1}
                            value={filters.maxDistance >= 9999 ? 200 : filters.maxDistance}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setFilter("maxDistance", v >= 200 ? 9999 : v);
                            }}
                            className="w-full accent-accent h-1.5 cursor-pointer"
                          />
                        </div>
                      )}
                      {galleryLocationMode === "local" && !userCoords && !geoRequesting && (
                        <div className="mt-3">
                          <p className="text-[10px] text-muted mb-1.5">Enter your postcode</p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={postcodeInput}
                              onChange={(e) => { setPostcodeInput(e.target.value.toUpperCase()); setPostcodeError(false); }}
                              onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSubmit(); }}
                              placeholder="EC1A 1BB"
                              className="flex-1 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase"
                            />
                            <button type="button" onClick={handlePostcodeSubmit} className="px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer">Go</button>
                          </div>
                          {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Arrangement</p>
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => { setGalleryFreeLoan(!galleryFreeLoan); if (!galleryFreeLoan) setGalleryRevenueShare(true); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm border text-left transition-colors ${
                            galleryFreeLoan ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryFreeLoan ? "text-accent" : "text-muted"}>
                            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                          <div>
                            <p className="text-xs font-medium">Display</p>
                            <p className="text-[10px] text-muted">Revenue share or paid loan</p>
                          </div>
                        </button>
                        {galleryFreeLoan && (
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
                            />
                            <span className="text-[10px] text-muted">%</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setGalleryPurchase(!galleryPurchase)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm border text-left transition-colors ${
                            galleryPurchase ? "border-accent bg-accent/5 text-foreground" : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={galleryPurchase ? "text-accent" : "text-muted"}>
                            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                          </svg>
                          <div>
                            <p className="text-xs font-medium">Purchase</p>
                            <p className="text-[10px] text-muted">Buy artwork outright</p>
                          </div>
                        </button>
                      </div>
                    </div>
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
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Availability</p>
                      <div className="space-y-1.5">
                        <CheckPill checked={galleryOriginals} onChange={setGalleryOriginals} label="Originals" />
                        <CheckPill checked={galleryPrints} onChange={setGalleryPrints} label="Prints" />
                        <CheckPill checked={galleryFraming} onChange={setGalleryFraming} label="Framing" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">
                        Price: £{galleryPriceMin} – {galleryPriceMax >= 1000 ? "£1000+" : `£${galleryPriceMax}`}
                      </p>
                      <div className="space-y-2 px-1">
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMin} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMin(Math.min(v, galleryPriceMax)); }} className="w-full accent-accent h-1.5" />
                        <input type="range" min={0} max={1000} step={50} value={galleryPriceMax} onChange={(e) => { const v = Number(e.target.value); setGalleryPriceMax(Math.max(v, galleryPriceMin)); }} className="w-full accent-accent h-1.5" />
                      </div>
                    </div>
                    {hasGalleryFilters && (
                      <button type="button" onClick={clearGalleryFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                    )}
                  </div>
                )}

                {/* Search + count + toggle – desktop */}
                <div className="hidden lg:flex items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-56">
                      <SearchBar variant="light" mode="desktop" placeholder="Search artworks..." />
                    </div>
                    <p className="text-sm text-muted whitespace-nowrap">
                      {filteredGalleryWorks.length} work{filteredGalleryWorks.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5 mr-1">
                      <button type="button" onClick={() => { setViewAs("artists"); setActiveDiscipline(""); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "artists" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Portfolios
                      </button>
                      <button type="button" onClick={() => { setViewAs("works"); setActiveDiscipline(""); }} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline !== "collections" && (viewAs as string) === "works" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Gallery
                      </button>
                      <button type="button" onClick={() => setActiveDiscipline("collections")} className={`px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer ${activeDiscipline === "collections" ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                        Collections
                      </button>
                    </div>
                    <select
                      value={gallerySort}
                      onChange={(e) => setGallerySort(e.target.value as typeof gallerySort)}
                      className="px-2.5 py-1.5 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer focus:outline-none focus:border-accent/50"
                    >
                      <option value="featured">Sort: Featured</option>
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
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filteredGalleryWorks.slice(0, loadedWorks).map((work) => {
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
                        <div className="bg-surface border border-border/50 rounded-lg overflow-hidden h-full flex flex-col">
                          {/* Image */}
                          <div
                            className="relative overflow-hidden bg-border/20 rounded-t-lg select-none"
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            {/* Clicking the image opens the full artwork page in a new tab.
                                The hover "eye" icon still triggers quick-look on the same tab. */}
                            <a href={fullPageHref} target="_blank" rel="noopener noreferrer" aria-label={`Open ${work.title} in new tab`}>
                              <Image
                                src={work.image}
                                alt={work.title}
                                width={600}
                                height={600}
                                className="w-full h-auto object-cover group-hover:scale-[1.03] transition-transform duration-700 pointer-events-none select-none"
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                draggable={false}
                                onContextMenu={(e) => e.preventDefault()}
                              />
                              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
                            </a>
                            {!work.available && (
                              <span className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/70 text-white text-[10px] rounded-sm backdrop-blur-sm">
                                Sold
                              </span>
                            )}
                            {/* Hover action buttons */}
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

                          {/* Info */}
                          <div className="px-4 py-3.5 flex-1 flex flex-col">
                            <div className="flex items-baseline justify-between gap-2">
                              <a href={fullPageHref} target="_blank" rel="noopener noreferrer" className="block group/title min-w-0 flex-1">
                                <h3 className="text-sm font-medium text-foreground leading-tight group-hover/title:text-accent transition-colors truncate">
                                  {work.title}
                                </h3>
                              </a>
                              {workDistance !== null && (
                                <span className="text-[10px] text-muted shrink-0">
                                  {workDistance < 0.2 ? "< 0.2 mi" : `${workDistance.toFixed(1)} mi`}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              {work.artistName} · {work.medium}
                            </p>
                            <p className="text-xs text-foreground/80 mt-1 font-medium">
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
                )}
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

      {activeDiscipline === "collections" && (
        <section className="py-10 lg:py-14">
          <div className="max-w-[1400px] mx-auto px-6">
            {/* Mobile toolbar — view pill-dropdown + Global/Local pills + slider */}
            <div className="lg:hidden mb-6 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select
                    value="collections"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "gallery") { setViewAs("works"); setActiveDiscipline(""); }
                      else if (v === "portfolios") { setViewAs("artists"); setActiveDiscipline(""); }
                    }}
                    className="appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-full border border-border bg-white text-foreground font-medium cursor-pointer focus:outline-none focus:border-foreground/50"
                  >
                    <option value="portfolios">Portfolios</option>
                    <option value="gallery">Gallery</option>
                    <option value="collections">Collections</option>
                  </select>
                  <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="2 4 6 8 10 4" />
                  </svg>
                </div>
                <div className="flex gap-1.5">
                  {(["global", "local"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setCollectionsLocationMode(mode); if (mode === "local" && !userCoords) handleModeChange("local"); }}
                      className={`px-3 py-1.5 text-[11px] rounded-full border transition-colors cursor-pointer capitalize ${
                        collectionsLocationMode === mode
                          ? "bg-foreground text-white border-foreground"
                          : "border-border bg-white text-muted hover:border-foreground/30"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              {collectionsLocationMode === "local" && geoRequesting && (
                <p className="text-xs text-muted animate-pulse">Detecting your location…</p>
              )}
              {collectionsLocationMode === "local" && !geoRequesting && userCoords && (
                <>
                  <p className="text-xs text-accent flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                    Location set
                    <button
                      type="button"
                      onClick={() => { setUserCoords(null); setPostcodeInput(""); setPostcodeError(false); }}
                      className="ml-1 text-[10px] text-muted underline cursor-pointer"
                    >
                      change
                    </button>
                  </p>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-1.5">
                      Within {filters.maxDistance >= 9999 ? "any distance" : `${filters.maxDistance} mi`}
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={1}
                      value={filters.maxDistance >= 9999 ? 200 : filters.maxDistance}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setFilter("maxDistance", v >= 200 ? 9999 : v);
                      }}
                      className="w-full accent-accent h-1.5 cursor-pointer"
                    />
                  </div>
                </>
              )}
              {collectionsLocationMode === "local" && !userCoords && !geoRequesting && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-1.5">Postcode</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={postcodeInput}
                      onChange={(e) => { setPostcodeInput(e.target.value.toUpperCase()); setPostcodeError(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSubmit(); }}
                      placeholder="EC1A 1BB"
                      className="flex-1 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase"
                    />
                    <button type="button" onClick={handlePostcodeSubmit} className="px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer">Go</button>
                  </div>
                  {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                </div>
              )}
            </div>
            {/* Desktop view toggle — 3-way pill group, right-aligned */}
            <div className="hidden lg:flex mb-6 items-center justify-end">
              <div className="flex items-center gap-0.5 bg-border/30 rounded-sm p-0.5">
                <button type="button" onClick={() => { setViewAs("artists"); setActiveDiscipline(""); }} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer text-muted hover:text-foreground">
                  Portfolios
                </button>
                <button type="button" onClick={() => { setViewAs("works"); setActiveDiscipline(""); }} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer text-muted hover:text-foreground">
                  Gallery
                </button>
                <button type="button" onClick={() => setActiveDiscipline("collections")} className="px-3 py-1 text-xs rounded-sm transition-colors cursor-pointer bg-white text-foreground shadow-sm">
                  Collections
                </button>
              </div>
            </div>
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-serif mb-2">Curated Collections</h2>
                <p className="text-sm text-muted">Themed bundles of artwork at a set price. Ready to transform your space.</p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {/* Desktop location toggle — keep the side-by-side button pair */}
                <div className="hidden lg:block">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-1.5">Location</p>
                  <div className="flex gap-2">
                    {(["global", "local"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setCollectionsLocationMode(mode); if (mode === "local" && !userCoords) handleModeChange("local"); }}
                        className={`px-3 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer capitalize ${
                          collectionsLocationMode === mode
                            ? "bg-foreground text-background border-foreground"
                            : "border-border bg-[#F8F6F2] lg:bg-white text-muted hover:border-foreground/30"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {collectionsLocationMode === "local" && userCoords && (
                  <div className="hidden lg:block min-w-[180px]">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-1.5">
                      Within {filters.maxDistance >= 9999 ? "any" : `${filters.maxDistance} mi`}
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={1}
                      value={filters.maxDistance >= 9999 ? 200 : filters.maxDistance}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setFilter("maxDistance", v >= 200 ? 9999 : v);
                      }}
                      className="w-full accent-accent h-1.5 cursor-pointer"
                    />
                  </div>
                )}
                {collectionsLocationMode === "local" && !userCoords && !geoRequesting && (
                  <div className="hidden lg:block">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-1.5">Postcode</p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={postcodeInput}
                        onChange={(e) => { setPostcodeInput(e.target.value.toUpperCase()); setPostcodeError(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSubmit(); }}
                        placeholder="EC1A 1BB"
                        className="w-28 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase"
                      />
                      <button type="button" onClick={handlePostcodeSubmit} className="px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer">Go</button>
                    </div>
                    {postcodeError && <p className="text-[10px] text-red-400 mt-1">Postcode not found</p>}
                  </div>
                )}
              </div>
            </div>
            {filteredCollections.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
              <p className="text-muted text-center py-16">
                {collections.filter((c) => c.available).length === 0
                  ? "No collections available yet."
                  : "No collections match this filter."}
              </p>
            )}
          </div>
        </section>
      )}

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
              <Button href="/register-venue" variant="secondary" size="md">
                Register Your Venue
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
