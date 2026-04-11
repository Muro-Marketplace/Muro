"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { artists as staticArtists, type Artist } from "@/data/artists";
import { themes } from "@/data/themes";
import { artistsToGalleryWorks } from "@/data/galleries";
import { collections } from "@/data/collections";
import { artCategories, getCategoryForMedium, matchesSubcategory, type ArtCategory } from "@/data/categories";
import { slugify } from "@/lib/slugify";
import { geocodePostcode } from "@/lib/geocode";
import Button from "@/components/Button";
import BrowseArtistCard from "@/components/BrowseArtistCard";
import CollectionCard from "@/components/CollectionCard";

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

const PRICE_BANDS = [
  { label: "All prices", value: "" },
  { label: "Under £150", value: "under150" },
  { label: "£150 – £300", value: "150-300" },
  { label: "£300 – £500", value: "300-500" },
  { label: "£500+", value: "500plus" },
];

function priceBandMatches(priceBand: string, filter: string): boolean {
  if (!filter) return true;
  const match = priceBand.replace(/[£,]/g, "").match(/\d+/);
  if (!match) return true;
  const low = parseInt(match[0], 10);
  if (filter === "under150") return low < 150;
  if (filter === "150-300") return low >= 150 && low < 300;
  if (filter === "300-500") return low >= 300 && low < 500;
  if (filter === "500plus") return low >= 500;
  return true;
}

interface Filters {
  mode: "local" | "global";
  maxDistance: number;
  themes: string[];
  originals: boolean;
  prints: boolean;
  framing: boolean;
  freeLoan: boolean;
  revenueShare: boolean;
  revenueShareMin: number;
  outrightPurchase: boolean;
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
  freeLoan: false,
  revenueShare: false,
  revenueShareMin: 0,
  outrightPurchase: false,
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

export default function BrowsePortfoliosPage() {
  const initialMode = typeof window !== "undefined" && window.location.hash === "#collections" ? "collections" : "";
  const [activeCategory, setActiveCategory] = useState<string>(initialMode);
  const [activeSubcategories, setActiveSubcategories] = useState<Set<string>>(new Set());
  const [viewAs, setViewAs] = useState<"artists" | "works">("artists");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [artists, setArtists] = useState<Artist[]>(staticArtists);

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
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"compact" | "expanded">("compact");
  const [mobileGrid, setMobileGrid] = useState<1 | 2>(1);

  // Gallery mode filters
  const [galleryTheme, setGalleryTheme] = useState("");
  const [galleryMedium, setGalleryMedium] = useState("");
  const [galleryAvailableOnly, setGalleryAvailableOnly] = useState(false);
  const [galleryPriceFilter, setGalleryPriceFilter] = useState("");
  const [galleryLocationMode, setGalleryLocationMode] = useState<"global" | "local">("global");
  const [galleryStyle, setGalleryStyle] = useState("");
  const [galleryOriginals, setGalleryOriginals] = useState(false);
  const [galleryPrints, setGalleryPrints] = useState(false);
  const [galleryFraming, setGalleryFraming] = useState(false);
  const [galleryFreeLoan, setGalleryFreeLoan] = useState(false);
  const [galleryRevenueShare, setGalleryRevenueShare] = useState(false);
  const [galleryRevenueShareMin, setGalleryRevenueShareMin] = useState(0);
  const [galleryPurchase, setGalleryPurchase] = useState(false);

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
    filters.freeLoan ||
    filters.revenueShare ||
    filters.revenueShareMin > 0 ||
    filters.outrightPurchase ||
    filters.venueTypes.length > 0 ||
    filters.styleMedium !== "";

  // Get active category object
  const activeCategoryObj = useMemo(() =>
    artCategories.find((c) => c.id === activeCategory) || null,
    [activeCategory]
  );

  // Available subcategories for the active category (dynamically computed from actual artist data)
  const availableSubcategories = useMemo(() => {
    if (!activeCategoryObj) return [];
    const artistsInCat = artists.filter((a) => activeCategoryObj.mediums.includes(a.primaryMedium));
    const subs = new Set<string>();
    for (const sub of activeCategoryObj.subcategories) {
      if (artistsInCat.some((a) => matchesSubcategory(sub, a.styleTags, a.themes))) {
        subs.add(sub);
      }
    }
    return Array.from(subs);
  }, [activeCategoryObj, artists]);

  const filteredArtists = useMemo(() => {
    return artists.filter((artist) => {
      // Category filter
      if (activeCategoryObj && !activeCategoryObj.mediums.includes(artist.primaryMedium)) return false;
      // Subcategory filter (any selected subcategory must match)
      if (activeSubcategories.size > 0 && !Array.from(activeSubcategories).some((sub) => matchesSubcategory(sub, artist.styleTags, artist.themes))) return false;

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
      if (filters.freeLoan && !artist.openToFreeLoan && !artist.openToRevenueShare) return false;
      if (filters.revenueShareMin > 0 && (!artist.openToRevenueShare || !artist.revenueSharePercent || artist.revenueSharePercent < filters.revenueShareMin)) return false;
      if (filters.outrightPurchase && !artist.openToOutrightPurchase)
        return false;
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
    });
  }, [artists, filters, userCoords, activeCategoryObj, activeSubcategories]);

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
      // Category filter
      if (activeCategoryObj && !activeCategoryObj.mediums.includes(work.artistPrimaryMedium)) return false;
      // Subcategory filter
      if (activeSubcategories.size > 0) {
        const matchesAny = Array.from(activeSubcategories).some((sub) => {
          const lower = sub.toLowerCase();
          return work.themes.some((t) => t.toLowerCase().includes(lower)) || work.medium.toLowerCase().includes(lower) || work.artistPrimaryMedium.toLowerCase().includes(lower);
        });
        if (!matchesAny) return false;
      }
      // Theme
      if (galleryTheme && !work.themes.includes(galleryTheme)) return false;
      // Medium (work-level)
      if (galleryMedium && work.medium !== galleryMedium) return false;
      // Style (artist primary medium)
      if (galleryStyle && work.artistPrimaryMedium !== galleryStyle) return false;
      // Availability
      if (galleryAvailableOnly && !work.available) return false;
      // Price
      if (!priceBandMatches(work.priceBand, galleryPriceFilter)) return false;
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
    });
  }, [allGalleryWorks, galleryTheme, galleryMedium, galleryStyle, galleryAvailableOnly, galleryPriceFilter, galleryOriginals, galleryPrints, galleryFraming, galleryFreeLoan, galleryRevenueShare, galleryRevenueShareMin, galleryPurchase, galleryLocationMode, userCoords, filters.maxDistance, activeCategoryObj, activeSubcategories]);

  const hasGalleryFilters =
    !!galleryTheme || !!galleryMedium || !!galleryStyle || galleryAvailableOnly || !!galleryPriceFilter || galleryOriginals || galleryPrints || galleryFraming || galleryFreeLoan || galleryRevenueShare || galleryPurchase || galleryLocationMode === "local";

  function clearGalleryFilters() {
    setGalleryTheme(""); setGalleryMedium(""); setGalleryStyle(""); setGalleryAvailableOnly(false);
    setGalleryPriceFilter(""); setGalleryOriginals(false); setGalleryPrints(false); setGalleryFraming(false);
    setGalleryFreeLoan(false); setGalleryRevenueShare(false); setGalleryRevenueShareMin(0); setGalleryPurchase(false);
    setGalleryLocationMode("global");
  }

  const FilterPanel = () => (
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
                  : "border-border text-muted hover:border-foreground/30"
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
                  <p className="text-[10px] text-red-400 mt-1">Postcode not found — try again</p>
                )}
              </div>
            )}
            {/* Distance options — only once we have a location */}
            {userCoords && (
              <div>
                <p className="text-xs text-muted mb-2">Distance</p>
                <div className="flex flex-wrap gap-1.5">
                  {DISTANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFilter("maxDistance", opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-sm border transition-all duration-150 cursor-pointer ${
                        filters.maxDistance === opt.value
                          ? "bg-accent text-white border-accent"
                          : "border-border text-muted hover:border-accent/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Style */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Style
        </p>
        <select
          value={filters.styleMedium}
          onChange={(e) => setFilter("styleMedium", e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
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
          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
        >
          <option value="">All themes</option>
          {themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Commercial Terms */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Commercial Terms
        </p>
        <div className="space-y-2.5">
          <CheckPill
            label="Display"
            checked={filters.freeLoan}
            onChange={(v) => { setFilter("freeLoan", v); if (v) setFilter("revenueShare", true); }}
          />
          <div className="flex items-center gap-1.5 pl-6">
              <span className="text-xs text-muted">Min Revenue Share</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue=""
                ref={(el) => { if (el && filters.revenueShareMin > 0 && !el.dataset.init) { el.value = String(filters.revenueShareMin); el.dataset.init = "1"; } }}
                onBlur={(e) => {
                  const val = Number(e.target.value) || 0;
                  setFilter("revenueShareMin", val);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = Number((e.target as HTMLInputElement).value) || 0;
                    setFilter("revenueShareMin", val);
                  }
                }}
                placeholder="e.g. 10"
                className="w-16 px-2 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground text-center focus:outline-none focus:border-accent/50"
              />
              <span className="text-xs text-muted">%</span>
          </div>
          <CheckPill
            label="Purchase"
            checked={filters.outrightPurchase}
            onChange={(v) => setFilter("outrightPurchase", v)}
          />
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
      {/* Hero – compact with background image */}
      <section className="relative -mt-14 lg:-mt-16 overflow-hidden border-b border-border">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1920&h=600&fit=crop&crop=center"
            alt="Abstract art"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-6 pt-16 lg:pt-20 pb-6 lg:pb-8">
          <div className="py-4">
            <h1 className="font-serif text-4xl lg:text-5xl text-white mb-3 leading-tight">
              The Marketplace
            </h1>
            <p className="text-sm lg:text-base text-white/50 leading-relaxed max-w-md">
              {activeCategory === "collections"
                ? "Themed bundles of artwork at a set price. Ready to transform your space."
                : activeCategoryObj
                ? `Browse ${activeCategoryObj.label.toLowerCase()} from curated artists.`
                : "Explore curated artist profiles. Discover commercial terms, styles, and availability."}
            </p>
          </div>
        </div>
      </section>

      {/* Category tabs */}
      <div className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {/* All */}
            <button
              type="button"
              onClick={() => { setActiveCategory(""); setActiveSubcategories(new Set()); }}
              className={`py-4 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeCategory === ""
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            {artCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setActiveCategory(cat.id); setActiveSubcategories(new Set()); }}
                className={`py-4 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeCategory === cat.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setActiveCategory("collections"); setActiveSubcategories(new Set()); }}
              className={`py-4 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeCategory === "collections"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Collections
            </button>
          </div>
        </div>
      </div>

      {/* Subcategory pills + view toggle */}
      {activeCategory !== "collections" && (
        <div className="border-b border-border bg-[#FAF8F5]">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              {activeCategoryObj ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSubcategories(new Set())}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                      activeSubcategories.size === 0
                        ? "bg-foreground text-white border-foreground"
                        : "border-border text-muted hover:border-foreground/30"
                    }`}
                  >
                    All {activeCategoryObj.label}
                  </button>
                  {availableSubcategories.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setActiveSubcategories((prev) => { const next = new Set(prev); if (next.has(sub)) next.delete(sub); else next.add(sub); return next; })}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                        activeSubcategories.has(sub)
                          ? "bg-foreground text-white border-foreground"
                          : "border-border text-muted hover:border-foreground/30"
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-xs text-muted">
                  {viewAs === "artists" ? `${filteredArtists.length} artists` : `${filteredGalleryWorks.length} works`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewAs("artists")}
                className={`px-3 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer ${
                  viewAs === "artists" ? "bg-foreground text-white border-foreground" : "border-border text-muted"
                }`}
              >
                Portfolios
              </button>
              <button
                type="button"
                onClick={() => setViewAs("works")}
                className={`px-3 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer ${
                  viewAs === "works" ? "bg-foreground text-white border-foreground" : "border-border text-muted"
                }`}
              >
                Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCategory !== "collections" && viewAs === "artists" && (
        /* ── Artists view ── */
        <section className="py-10 lg:py-14">
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
                <FilterPanel />
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-6 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {filteredArtists.length} artist
                    {filteredArtists.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
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
                    <FilterPanel />
                  </div>
                )}

                {/* Result count + view toggle – desktop */}
                <div className="hidden lg:flex items-center justify-between mb-6">
                  <p className="text-sm text-muted">
                    {filteredArtists.length} artist
                    {filteredArtists.length !== 1 ? "s" : ""}
                    {hasActiveFilters && " matching your filters"}
                  </p>
                  <div className="flex items-center gap-1">
                    {/* Compact / grid icon */}
                    <button
                      type="button"
                      title="Compact view"
                      onClick={() => setViewMode("compact")}
                      className={`p-1.5 rounded-sm border transition-colors duration-150 cursor-pointer ${
                        viewMode === "compact"
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted hover:border-foreground/30"
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
                          : "border-border text-muted hover:border-foreground/30"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="0" y="0" width="14" height="4" rx="0.5" />
                        <rect x="0" y="5" width="14" height="4" rx="0.5" />
                        <rect x="0" y="10" width="14" height="4" rx="0.5" />
                      </svg>
                    </button>
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
                    {filteredArtists.map((artist) => {
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
                    {filteredArtists.map((artist) => (
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
                            {artist.primaryMedium} &middot; {artist.location}
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
              </div>
            </div>
          </div>
        </section>
      )}

      {activeCategory !== "collections" && viewAs === "works" && (
        /* ── Gallery mode with sidebar ── */
        <section className="py-10 lg:py-14">
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
                        <button key={mode} type="button" onClick={() => { setGalleryLocationMode(mode); if (mode === "local" && !userCoords) handleModeChange("local"); }} className={`flex-1 py-2 text-sm rounded-sm border transition-all duration-150 capitalize cursor-pointer ${galleryLocationMode === mode ? "bg-foreground text-background border-foreground" : "border-border text-muted hover:border-foreground/30"}`}>
                          {mode}
                        </button>
                      ))}
                    </div>
                    {galleryLocationMode === "local" && userCoords && (
                      <div className="mt-3">
                        <p className="text-xs text-muted mb-2">Distance</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DISTANCE_OPTIONS.map((opt) => (
                            <button key={opt.value} type="button" onClick={() => setFilter("maxDistance", opt.value)} className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${filters.maxDistance === opt.value ? "bg-foreground text-background border-foreground" : "border-border text-muted hover:border-foreground/30"}`}>
                              {opt.label}
                            </button>
                          ))}
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

                  {/* Commercial Terms */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Commercial Terms</p>
                    <div className="space-y-2.5">
                      <CheckPill checked={galleryFreeLoan} onChange={setGalleryFreeLoan} label="Display" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted">Min Revenue Share</span>
                        <input type="number" min={0} max={50} value={galleryRevenueShareMin || ""} onChange={(e) => setGalleryRevenueShareMin(Number(e.target.value) || 0)} placeholder="e.g. 10" className="w-16 px-2 py-1 bg-surface border border-border rounded-sm text-xs text-foreground text-center focus:outline-none focus:border-accent/50" />
                        <span className="text-xs text-muted">%</span>
                      </div>
                      <CheckPill checked={galleryPurchase} onChange={setGalleryPurchase} label="Purchase" />
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

                  {/* Price */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Price</p>
                    <div className="space-y-1.5">
                      {PRICE_BANDS.filter((b) => b.value).map((b) => (
                        <CheckPill key={b.value} checked={galleryPriceFilter === b.value} onChange={() => setGalleryPriceFilter(galleryPriceFilter === b.value ? "" : b.value)} label={b.label} />
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <div className="lg:hidden mb-6 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {filteredGalleryWorks.length} work{filteredGalleryWorks.length !== 1 ? "s" : ""}
                  </p>
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

                {/* Mobile filter drawer */}
                {sidebarOpen && activeCategory !== "collections" && viewAs === "works" && (
                  <div className="lg:hidden mb-6 bg-surface border border-border rounded-sm p-4 space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Filters</span>
                      <button type="button" onClick={() => setSidebarOpen(false)} className="text-xs text-muted hover:text-foreground cursor-pointer">Close</button>
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
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Commercial Terms</p>
                      <div className="space-y-1.5">
                        <CheckPill checked={galleryFreeLoan} onChange={setGalleryFreeLoan} label="Display" />
                        <CheckPill checked={galleryPurchase} onChange={setGalleryPurchase} label="Purchase" />
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
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Price</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PRICE_BANDS.filter((b) => b.value).map((b) => (
                          <button key={b.value} type="button" onClick={() => setGalleryPriceFilter(galleryPriceFilter === b.value ? "" : b.value)} className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${galleryPriceFilter === b.value ? "bg-accent text-white border-accent" : "border-border text-muted hover:border-foreground/30"}`}>{b.label}</button>
                        ))}
                      </div>
                    </div>
                    {hasGalleryFilters && (
                      <button type="button" onClick={clearGalleryFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                    )}
                  </div>
                )}

                {/* Results count */}
                <div className="hidden lg:flex items-center justify-between mb-6">
                  <p className="text-sm text-muted">
                    {filteredGalleryWorks.length} work{filteredGalleryWorks.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {filteredGalleryWorks.length === 0 ? (
                  <div className="py-24 text-center">
                    <p className="text-muted text-lg mb-4">No works match these filters.</p>
                    <button type="button" onClick={clearGalleryFilters} className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer">Clear all filters</button>
                  </div>
                ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5">
                  {filteredGalleryWorks.map((work) => (
                    <Link
                      key={work.id}
                      href={`/browse/${work.artistSlug}#work-${slugify(work.title)}`}
                      className="group break-inside-avoid block"
                    >
                      <div className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 hover:shadow-sm transition-all duration-300">
                        {/* Image */}
                        <div className="relative overflow-hidden bg-border/20">
                          <Image
                            src={work.image}
                            alt={work.title}
                            width={600}
                            height={750}
                            className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          />
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-end">
                            <div className="p-4 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-1 group-hover:translate-y-0">
                              <p className="text-white text-xs font-medium">
                                {work.artistName} →
                              </p>
                            </div>
                          </div>
                          {/* Availability badge */}
                          {!work.available && (
                            <div className="absolute top-2.5 right-2.5">
                              <span className="inline-block px-2 py-0.5 bg-black/70 text-white text-[10px] rounded-sm backdrop-blur-sm">
                                Sold
                              </span>
                            </div>
                          )}
                          {work.available && (
                            <div className="absolute top-2.5 right-2.5">
                              <span className="inline-block px-2 py-0.5 bg-accent/90 text-white text-[10px] rounded-sm backdrop-blur-sm">
                                Available
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3.5">
                          <h3 className="font-sans text-sm font-medium text-foreground leading-tight mb-0.5">
                            {work.title}
                          </h3>
                          <p className="text-xs text-accent font-medium mb-1">
                            {work.artistName}
                          </p>
                          <p className="text-xs text-muted">
                            {work.medium} &middot; {work.dimensions}
                          </p>
                          <p className="text-xs text-foreground/80 mt-1.5 font-medium">
                            {work.priceBand}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeCategory === "collections" && (
        <section className="py-10 lg:py-14">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="mb-8">
              <h2 className="text-2xl font-serif mb-2">Curated Collections</h2>
              <p className="text-sm text-muted">Themed bundles of artwork at a set price. Ready to transform your space.</p>
            </div>
            {collections.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {collections.filter((c) => c.available).map((col) => (
                  <CollectionCard key={col.id} collection={col} />
                ))}
              </div>
            ) : (
              <p className="text-muted text-center py-16">No collections available yet.</p>
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
                Apply to Join Wallspace
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
