"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import EmptyState from "@/components/EmptyState";
import { useSaved } from "@/context/SavedContext";
import { artists } from "@/data/artists";
import { slugify } from "@/lib/slugify";

type Tab = "artists" | "works" | "collections";

// The merged catalogue as /api/browse-artists returns it (static seed plus the
// database), reduced to what a saved-work card needs.
interface CatalogueWork { id: string; title: string; image: string; priceBand?: string }
interface CatalogueArtist { slug: string; name: string; works?: CatalogueWork[] }
interface SavedWorkCard {
  id: string;
  title: string;
  image: string;
  artistName: string;
  artistSlug: string;
  priceBand: string;
}

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<Tab>("works");
  const { savedItems, toggleSaved } = useSaved();

  // LA-C003 (launch audit 2026-09-05). Saved work ids used to be resolved against
  // getGalleryWorks(), the static seed only, so a work hearted from a database
  // artist's page was dropped and the tab read "No saved works yet". Resolve
  // against the merged catalogue, as the customer and artist portals do, and
  // say so when the catalogue could not be loaded rather than pretending the
  // list is empty.
  const [catalogue, setCatalogue] = useState<CatalogueArtist[]>([]);
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "error">("loading");

  const loadCatalogue = useCallback(() => {
    fetch("/api/browse-artists")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !Array.isArray(data?.artists)) throw new Error("catalogue unavailable");
        setCatalogue(data.artists as CatalogueArtist[]);
        setCatalogueState("ready");
      })
      .catch(() => setCatalogueState("error"));
  }, []);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  // Resolve saved work IDs to actual work data
  const savedWorks = useMemo(() => {
    const byId = new Map<string, SavedWorkCard>();
    for (const artist of catalogue) {
      for (const work of artist.works ?? []) {
        byId.set(work.id, {
          id: work.id,
          title: work.title,
          image: work.image,
          artistName: artist.name,
          artistSlug: artist.slug,
          priceBand: work.priceBand ?? "",
        });
      }
    }
    return savedItems
      .filter((s) => s.type === "work")
      .map((s) => byId.get(s.id) ?? null)
      .filter((w): w is SavedWorkCard => w !== null);
  }, [savedItems, catalogue]);

  // Only artists explicitly saved (type === "artist"). Previously
  // this was derived from savedWorks, saving a work was being
  // treated as saving the artist, so the count and grid filled
  // up with artists the venue had never actually saved (heart on
  // any work bumped the saved-artists count). Counts on the
  // dashboard, the placement-request artist picker, and this
  // page now all read from the same explicit savedItems source.
  //
  // The list is built from `savedItems` directly, not from
  // intersecting with the static `artists` array, because artists
  // who joined after the seed shipped (or who only live in the
  // database) were being silently dropped. Effect was a dashboard
  // pill showing 5 saved artists while the page rendered 3. Build
  // a row per saved slug and look up display details from `artists`
  // when available, falling back to a slug-derived display name and
  // a placeholder image otherwise.
  const savedArtistSlugs = useMemo(() => {
    const lookup = new Map(artists.map((a) => [a.slug, a] as const));
    return savedItems
      .filter((s) => s.type === "artist")
      .map((s) => {
        const known = lookup.get(s.id);
        if (known) return known;
        return {
          slug: s.id,
          // Slug to readable name fallback. Same transform the
          // placement picker uses for slugs without resolved names.
          name: s.id
            .split("-")
            .map((w) => (w.charAt(0).toUpperCase() + w.slice(1)))
            .join(" "),
          // Empty image is handled by the next/image fallback below.
          image: "",
          primaryMedium: "",
          location: "",
        };
      });
  }, [savedItems]);

  return (
    <VenuePortalLayout>
      <div className="mb-6">
        <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
          Saved
        </h1>
        <p className="text-sm text-muted">
          Artists and artworks you&apos;ve bookmarked.
        </p>
      </div>

      {/* Tabs, horizontal scroll on narrow mobile to avoid wrapping */}
      <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto scrollbar-none -mx-1 px-1">
        {(["works", "artists", "collections"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px cursor-pointer whitespace-nowrap ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "artists" ? "Artists" : tab === "collections" ? "Collections" : "Works"}
            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-full text-muted">
              {tab === "artists" ? savedArtistSlugs.length : tab === "collections" ? savedItems.filter((s) => s.type === "collection").length : savedWorks.length}
            </span>
          </button>
        ))}
      </div>

      {/* Works tab */}
      {activeTab === "works" && (
        <>
          {catalogueState === "loading" ? (
            <p className="text-sm text-muted py-12 text-center">Loading saved works...</p>
          ) : catalogueState === "error" ? (
            <div className="bg-surface border border-border rounded-sm p-6 text-center">
              <p className="text-sm text-foreground mb-3">
                Could not load your saved works. Please try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCatalogueState("loading");
                  loadCatalogue();
                }}
                className="px-4 py-2 text-xs font-medium border border-border rounded-sm text-foreground hover:border-accent transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : savedWorks.length === 0 ? (
            <EmptyState
              title="No saved works yet"
              hint="Browse galleries and tap the heart on pieces you'd like to revisit."
              cta={{ label: "Browse galleries", href: "/browse" }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {savedWorks.map((work, index) => (
                <div
                  key={work.id}
                  className="bg-white border border-border rounded-sm overflow-hidden"
                >
                  <div className="relative aspect-[4/3] bg-border/20">
                    {/* Eager-load the first row (≤3 cards) so above-fold
                        thumbnails appear without scrolling. The Intersection
                        Observer next/image uses for lazy-load has been
                        triggering AFTER the user lands on the page,
                        leaving the visible row blank for a tick. */}
                    <Image
                      src={work.image}
                      alt={work.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      priority={index < 3}
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-sm text-foreground mb-0.5 leading-snug">
                      {work.title}
                    </h3>
                    <p className="text-xs text-muted mb-1">{work.artistName}</p>
                    <p className="text-xs text-accent font-medium mb-4">
                      {work.priceBand}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href={`/browse/${work.artistSlug}?work=${slugify(work.title)}`}
                        className="flex-1 text-center px-3 py-1.5 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleSaved("work", work.id)}
                        className="px-3 py-1.5 text-xs border border-border text-muted rounded-sm hover:border-red-300 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Artists tab */}
      {activeTab === "artists" && (
        <>
          {savedArtistSlugs.length === 0 ? (
            <EmptyState
              title="No saved artists yet"
              hint="Save an artist's work and they'll appear here."
              cta={{ label: "Browse portfolios", href: "/browse?view=portfolios" }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {savedArtistSlugs.map((artist) => {
                // Some saved entries are slug-only fallbacks (artist
                // wasn't in the static seed). Render a coloured-initial
                // placeholder for those instead of letting next/image
                // hit an empty src.
                const hasImage = typeof artist.image === "string" && artist.image.length > 0;
                const meta = [artist.primaryMedium, artist.location]
                  .filter((v): v is string => typeof v === "string" && v.length > 0)
                  .join(" · ");
                return (
                  <div
                    key={artist.slug}
                    className="bg-white border border-border rounded-sm overflow-hidden"
                  >
                    <div className="relative aspect-[3/4] bg-border/20">
                      {hasImage ? (
                        <Image
                          src={artist.image}
                          alt={artist.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center bg-accent/10 text-accent text-3xl font-medium">
                          {(artist.name.trim().charAt(0) || "?").toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-sm text-foreground mb-0.5">
                        {artist.name}
                      </h3>
                      {meta && (
                        <p className="text-xs text-muted mb-4">{meta}</p>
                      )}
                      {!meta && <div className="mb-4" />}
                      <Link
                        href={`/browse/${artist.slug}`}
                        className="block text-center px-3 py-1.5 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors"
                      >
                        View Profile
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Collections tab */}
      {activeTab === "collections" && (() => {
        const savedCollections = savedItems.filter((s) => s.type === "collection");
        return savedCollections.length === 0 ? (
          <EmptyState
            title="No saved collections yet"
            hint="Browse collections and tap the heart icon to save them."
            cta={{ label: "Browse collections", href: "/browse?view=collections" }}
          />
        ) : (
          <div className="space-y-3">
            {savedCollections.map((item) => (
              <div key={item.id} className="bg-white border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded bg-accent/10 shrink-0 flex items-center justify-center">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-accent"><rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" /></svg>
                  </div>
                  <div className="min-w-0">
                    <Link href={`/browse/collections/${encodeURIComponent(item.id)}`} className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
                      {item.id.includes(" ") ? item.id : item.id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                    </Link>
                    <p className="text-xs text-muted mt-0.5">
                      Saved {new Date(item.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSaved("collection", item.id)}
                  className="text-xs text-muted hover:text-red-600 transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        );
      })()}
    </VenuePortalLayout>
  );
}
