"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { artists } from "@/data/artists";
import { themes } from "@/data/themes";
import { getGalleryWorks } from "@/data/galleries";
import { collections } from "@/data/collections";
import Button from "@/components/Button";
import BrowseArtistCard from "@/components/BrowseArtistCard";
import CollectionCard from "@/components/CollectionCard";

// Central London reference point
const USER_LAT = 51.5074;
const USER_LNG = -0.1278;

function calcDistance(lat: number, lng: number): number {
  return Math.sqrt((lat - USER_LAT) ** 2 + (lng - USER_LNG) ** 2) * 69;
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
  const initialMode = typeof window !== "undefined" && window.location.hash === "#collections" ? "collections" : "portfolios";
  const [browseMode, setBrowseMode] = useState<"portfolios" | "gallery" | "collections">(initialMode);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"compact" | "expanded">("compact");

  const [revShareInput, setRevShareInput] = useState("");

  // Gallery mode filters
  const [galleryTheme, setGalleryTheme] = useState("");
  const [galleryMedium, setGalleryMedium] = useState("");
  const [galleryAvailableOnly, setGalleryAvailableOnly] = useState(false);
  const [galleryPriceFilter, setGalleryPriceFilter] = useState("");

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

  const filteredArtists = useMemo(() => {
    return artists.filter((artist) => {
      if (filters.mode === "local") {
        const dist = calcDistance(
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
      if (filters.freeLoan && !artist.openToFreeLoan) return false;
      if (filters.revenueShare && !artist.openToRevenueShare) return false;
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
  }, [filters]);

  const allMediums = useMemo(
    () => Array.from(new Set(artists.map((a) => a.primaryMedium))).sort(),
    []
  );

  const allGalleryWorks = useMemo(() => getGalleryWorks(), []);

  const allGalleryMediums = useMemo(
    () => Array.from(new Set(allGalleryWorks.map((w) => w.medium))).sort(),
    [allGalleryWorks]
  );

  const filteredGalleryWorks = useMemo(() => {
    return allGalleryWorks.filter((work) => {
      if (galleryTheme && !work.themes.includes(galleryTheme)) return false;
      if (galleryMedium && work.medium !== galleryMedium) return false;
      if (galleryAvailableOnly && !work.available) return false;
      if (!priceBandMatches(work.priceBand, galleryPriceFilter)) return false;
      return true;
    });
  }, [allGalleryWorks, galleryTheme, galleryMedium, galleryAvailableOnly, galleryPriceFilter]);

  const hasGalleryFilters =
    !!galleryTheme || !!galleryMedium || galleryAvailableOnly || !!galleryPriceFilter;

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
              onClick={() => setFilter("mode", mode)}
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
          <div className="mt-3">
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

      {/* Commercial Terms – moved above Availability */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">
          Commercial Terms
        </p>
        <div className="space-y-2.5">
          <CheckPill
            label="Free loan"
            checked={filters.freeLoan}
            onChange={(v) => setFilter("freeLoan", v)}
          />
          <CheckPill
            label="Outright purchase"
            checked={filters.outrightPurchase}
            onChange={(v) => setFilter("outrightPurchase", v)}
          />
          <CheckPill
            label="Revenue share"
            checked={filters.revenueShare}
            onChange={(v) => setFilter("revenueShare", v)}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">Min share</span>
            <input
              type="text"
              inputMode="numeric"
              value={revShareInput}
              onChange={(e) => setRevShareInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => setFilter("revenueShareMin", Number(revShareInput) || 0)}
              onKeyDown={(e) => { if (e.key === "Enter") setFilter("revenueShareMin", Number(revShareInput) || 0); }}
              placeholder="e.g. 10"
              className="w-20 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground text-center focus:outline-none focus:border-accent/50"
            />
            <span className="text-[10px] text-muted">%</span>
          </div>
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

        <div className="relative max-w-[1400px] mx-auto px-6 pt-30 lg:pt-28 pb-12 lg:pb-14">
          <div className="py-4">
            <h1 className="font-serif text-3xl lg:text-4xl text-white mb-3 leading-tight">
              The Marketplace
            </h1>
            <p className="text-sm lg:text-base text-white/50 leading-relaxed max-w-md">
              {browseMode === "portfolios"
                ? "Explore curated artist profiles. Discover commercial terms, styles, and availability."
                : "Browse individual artworks. Filter by theme, medium, or price."}
            </p>
          </div>
        </div>
      </section>

      {/* Mode toggle – tab style, visually distinct from filter toggles */}
      <div className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setBrowseMode("portfolios")}
              className={`py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                browseMode === "portfolios"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Portfolios
            </button>
            <button
              type="button"
              onClick={() => setBrowseMode("gallery")}
              className={`py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                browseMode === "gallery"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Gallery
            </button>
            <button
              type="button"
              onClick={() => setBrowseMode("collections")}
              className={`py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                browseMode === "collections"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Collections
            </button>
          </div>
        </div>
      </div>

      {browseMode === "portfolios" && (
        /* ── Portfolios mode ── */
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
                    <p className="text-muted mb-4">
                      No artists match these filters.
                    </p>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-sm text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : viewMode === "compact" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredArtists.map((artist) => {
                      const distance = calcDistance(artist.coordinates.lat, artist.coordinates.lng);
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

      {browseMode === "gallery" && (
        /* ── Gallery mode ── */
        <>
          {/* Gallery filter bar */}
          <section className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
            <div className="max-w-[1400px] mx-auto px-6 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Theme */}
                <select
                  value={galleryTheme}
                  onChange={(e) => setGalleryTheme(e.target.value)}
                  className="px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                >
                  <option value="">All themes</option>
                  {themes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {/* Medium */}
                <select
                  value={galleryMedium}
                  onChange={(e) => setGalleryMedium(e.target.value)}
                  className="px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                >
                  <option value="">All mediums</option>
                  {allGalleryMediums.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                {/* Price */}
                <select
                  value={galleryPriceFilter}
                  onChange={(e) => setGalleryPriceFilter(e.target.value)}
                  className="px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                >
                  {PRICE_BANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>

                {/* Available only */}
                <button
                  type="button"
                  onClick={() => setGalleryAvailableOnly(!galleryAvailableOnly)}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <span
                    className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                      galleryAvailableOnly
                        ? "bg-accent border-accent"
                        : "border-border group-hover:border-muted"
                    }`}
                  >
                    {galleryAvailableOnly && (
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
                    Available only
                  </span>
                </button>

                {/* Results count + clear */}
                <div className="ml-auto flex items-center gap-4">
                  <span className="text-sm text-muted">
                    {filteredGalleryWorks.length} work
                    {filteredGalleryWorks.length !== 1 ? "s" : ""}
                  </span>
                  {hasGalleryFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setGalleryTheme("");
                        setGalleryMedium("");
                        setGalleryAvailableOnly(false);
                        setGalleryPriceFilter("");
                      }}
                      className="text-sm text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Gallery grid */}
          <section className="py-10 lg:py-14">
            <div className="max-w-[1400px] mx-auto px-6">
              {filteredGalleryWorks.length === 0 ? (
                <div className="py-24 text-center">
                  <p className="text-muted text-lg mb-4">
                    No works match these filters.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryTheme("");
                      setGalleryMedium("");
                      setGalleryAvailableOnly(false);
                      setGalleryPriceFilter("");
                    }}
                    className="text-sm text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5">
                  {filteredGalleryWorks.map((work) => (
                    <Link
                      key={work.id}
                      href={`/browse/${work.artistSlug}`}
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
                                View Artist →
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
          </section>
        </>
      )}

      {browseMode === "collections" && (
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
              <Button href="/spaces" variant="secondary" size="md">
                Request Artwork for Your Venue
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
