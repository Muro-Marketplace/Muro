"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Artist, ArtistWork } from "@/data/artists";

interface SearchBarProps {
  variant: "light" | "dark";
  /** Render only the desktop inline input or only the mobile icon + overlay */
  mode?: "desktop" | "mobile";
  /** Custom placeholder text */
  placeholder?: string;
}

interface ArtistResult {
  type: "artist";
  slug: string;
  name: string;
  location: string;
  primaryMedium: string;
  image: string;
}

interface WorkResult {
  type: "work";
  title: string;
  artistName: string;
  artistSlug: string;
  image: string;
}

type SearchResult = ArtistResult | WorkResult;

function fuzzyMatch(query: string, artist: Artist): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const searchableText = [
    artist.name,
    artist.location,
    artist.primaryMedium,
    artist.shortBio,
    ...(artist.styleTags || []),
    ...(artist.themes || []),
  ]
    .join(" ")
    .toLowerCase();

  return words.every((word) => searchableText.includes(word));
}

function fuzzyMatchWork(
  query: string,
  work: ArtistWork,
  artist: Artist
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const searchableText = [work.title, work.medium, artist.name]
    .join(" ")
    .toLowerCase();

  return words.every((word) => searchableText.includes(word));
}

export default function SearchBar({ variant, mode, placeholder: customPlaceholder }: SearchBarProps) {
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [fetched, setFetched] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch artists once on first interaction
  const ensureFetched = useCallback(() => {
    if (fetched) return;
    setFetched(true);
    fetch("/api/browse-artists")
      .then((r) => r.json())
      .then((data) => {
        if (data.artists) setArtists(data.artists);
      })
      .catch(() => {});
  }, [fetched]);

  // Debounce query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Run search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    const artistResults: ArtistResult[] = [];
    const workResults: WorkResult[] = [];

    for (const artist of artists) {
      if (artistResults.length >= 8) break;
      if (fuzzyMatch(debouncedQuery, artist)) {
        artistResults.push({
          type: "artist",
          slug: artist.slug,
          name: artist.name,
          location: artist.location,
          primaryMedium: artist.primaryMedium,
          image: artist.image,
        });
      }
    }

    // Also search works
    for (const artist of artists) {
      if (workResults.length >= 4) break;
      for (const work of artist.works || []) {
        if (workResults.length >= 4) break;
        if (fuzzyMatchWork(debouncedQuery, work, artist)) {
          // Avoid duplicate if artist already matched
          workResults.push({
            type: "work",
            title: work.title,
            artistName: artist.name,
            artistSlug: artist.slug,
            image: work.image,
          });
        }
      }
    }

    setResults([...artistResults, ...workResults]);
    setActiveIndex(-1);
  }, [debouncedQuery, artists]);

  // Click outside to close desktop dropdown
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  // Focus mobile input when overlay opens
  useEffect(() => {
    if (mobileOpen && mobileInputRef.current) {
      // Small delay to let the overlay render
      const t = setTimeout(() => mobileInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [mobileOpen]);

  // Lock body scroll when mobile overlay is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      if (result.type === "artist") {
        router.push(`/browse/${result.slug}`);
      } else {
        const anchor = result.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        router.push(`/browse/${result.artistSlug}#work-${anchor}`);
      }
      setQuery("");
      setDebouncedQuery("");
      setShowDropdown(false);
      setMobileOpen(false);
      setResults([]);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        navigateToResult(results[activeIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
        setMobileOpen(false);
        setQuery("");
        setDebouncedQuery("");
      }
    },
    [activeIndex, results, navigateToResult]
  );

  const isDark = variant === "dark";

  // Shared result list renderer
  const renderResults = (isMobile: boolean) => {
    const hasQuery = debouncedQuery.trim().length > 0;
    if (!hasQuery) return null;

    const artistResults = results.filter(
      (r): r is ArtistResult => r.type === "artist"
    );
    const workResults = results.filter(
      (r): r is WorkResult => r.type === "work"
    );

    if (results.length === 0) {
      return (
        <div className={`${isMobile ? "px-5 pt-6" : "p-4"}`}>
          <p className="text-sm text-muted">
            No artists match &lsquo;{debouncedQuery}&rsquo;
          </p>
          <button
            onClick={() => {
              router.push("/browse");
              setMobileOpen(false);
              setShowDropdown(false);
              setQuery("");
            }}
            className="text-sm text-accent hover:text-accent-hover mt-2 inline-block"
          >
            Browse all artists
          </button>
        </div>
      );
    }

    let globalIndex = -1;

    return (
      <div>
        {/* Artist results */}
        {artistResults.length > 0 && (
          <div>
            <p
              className={`text-[10px] font-medium uppercase tracking-widest text-muted ${
                isMobile ? "px-5 pt-4 pb-1.5" : "px-3 pt-3 pb-1.5"
              }`}
            >
              Artists
            </p>
            {artistResults.map((result) => {
              globalIndex++;
              const idx = globalIndex;
              return (
                <button
                  key={`artist-${result.slug}`}
                  onClick={() => navigateToResult(result)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left flex items-center gap-3 transition-colors duration-100 ${
                    isMobile
                      ? "px-5 py-3"
                      : "px-3 py-2.5"
                  } ${activeIndex === idx ? "bg-background" : "hover:bg-background"}`}
                >
                  {result.image ? (
                    <img
                      src={result.image}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-accent">
                        {result.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {result.name}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {result.primaryMedium} &middot; {result.location}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Work results */}
        {workResults.length > 0 && (
          <div>
            <p
              className={`text-[10px] font-medium uppercase tracking-widest text-muted border-t border-border ${
                isMobile ? "px-5 pt-4 pb-1.5 mt-1" : "px-3 pt-3 pb-1.5 mt-1"
              }`}
            >
              Works
            </p>
            {workResults.map((result) => {
              globalIndex++;
              const idx = globalIndex;
              return (
                <button
                  key={`work-${result.artistSlug}-${result.title}`}
                  onClick={() => navigateToResult(result)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left flex items-center gap-3 transition-colors duration-100 ${
                    isMobile
                      ? "px-5 py-3"
                      : "px-3 py-2.5"
                  } ${activeIndex === idx ? "bg-background" : "hover:bg-background"}`}
                >
                  {result.image ? (
                    <img
                      src={result.image}
                      alt=""
                      className="w-10 h-10 rounded-sm object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-sm bg-border/30 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {result.title}
                    </p>
                    <p className="text-xs text-muted truncate">
                      by {result.artistName}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Browse all link */}
        <div
          className={`border-t border-border ${
            isMobile ? "px-5 py-3 mt-1" : "px-3 py-2.5 mt-1"
          }`}
        >
          <button
            onClick={() => {
              router.push("/browse");
              setMobileOpen(false);
              setShowDropdown(false);
              setQuery("");
            }}
            className="text-xs text-accent hover:text-accent-hover"
          >
            Browse all artists
          </button>
        </div>
      </div>
    );
  };

  // Magnifying glass icon
  const SearchIcon = ({ className }: { className?: string }) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );

  const showDesktop = !mode || mode === "desktop";
  const showMobile = !mode || mode === "mobile";

  return (
    <>
      {/* ─── Desktop search ─── */}
      {showDesktop && (
      <div ref={containerRef} className="relative hidden lg:block">
        <div
          className={`flex items-center rounded-sm border transition-all duration-200 ${
            isDark
              ? "border-white/20 bg-white/5 focus-within:border-white/40 focus-within:bg-white/10"
              : "border-border bg-white focus-within:border-accent/40 focus-within:shadow-sm"
          } w-48 focus-within:w-56`}
        >
          <SearchIcon
            className={`ml-2.5 shrink-0 ${
              isDark ? "text-white/50" : "text-muted"
            }`}
          />
          <input
            ref={desktopInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
              ensureFetched();
            }}
            onFocus={() => {
              ensureFetched();
              if (query.trim()) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={customPlaceholder || "Search artists..."}
            className={`w-full py-1.5 pl-2 pr-2.5 text-sm bg-transparent outline-none placeholder:text-sm ${
              isDark
                ? "text-white placeholder:text-white/40"
                : "text-foreground placeholder:text-muted"
            }`}
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
                setResults([]);
                setShowDropdown(false);
                desktopInputRef.current?.focus();
              }}
              className={`mr-2 shrink-0 ${
                isDark
                  ? "text-white/40 hover:text-white/70"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Desktop dropdown */}
        {showDropdown && debouncedQuery.trim() && (
          <div className="absolute top-full mt-1 w-80 bg-white border border-border rounded-sm shadow-lg z-50 max-h-[420px] overflow-y-auto">
            {renderResults(false)}
          </div>
        )}
      </div>
      )}

      {/* ─── Mobile search icon + overlay ─── */}
      {showMobile && (
        <>
          <button
            type="button"
            onClick={() => {
              setMobileOpen(true);
              ensureFetched();
            }}
            className={`lg:hidden p-2 transition-colors duration-300 ${
              isDark ? "text-white" : "text-foreground"
            }`}
            aria-label="Search"
          >
            <SearchIcon />
          </button>

          {mobileOpen && (
            <div className="fixed inset-0 z-[200] bg-white flex flex-col">
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="flex-1 flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2">
                  <SearchIcon className="text-muted shrink-0" />
                  <input
                    ref={mobileInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      ensureFetched();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search artists, works, styles..."
                    className="w-full text-base bg-transparent outline-none text-foreground placeholder:text-muted"
                    autoComplete="off"
                  />
                  {query && (
                    <button
                      onClick={() => {
                        setQuery("");
                        setDebouncedQuery("");
                        setResults([]);
                        mobileInputRef.current?.focus();
                      }}
                      className="text-muted hover:text-foreground shrink-0"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    setQuery("");
                    setDebouncedQuery("");
                    setResults([]);
                  }}
                  className="text-sm text-muted hover:text-foreground shrink-0 py-1"
                >
                  Cancel
                </button>
              </div>

              {/* Results area */}
              <div className="flex-1 overflow-y-auto">
                {!debouncedQuery.trim() ? (
                  <div className="px-5 pt-8 text-center">
                    <p className="text-sm text-muted">
                      Search by artist name, medium, style, location...
                    </p>
                  </div>
                ) : (
                  renderResults(true)
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
