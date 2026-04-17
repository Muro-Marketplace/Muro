"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useSaved } from "@/context/SavedContext";
import { artists } from "@/data/artists";
import { getGalleryWorks } from "@/data/galleries";
import { slugify } from "@/lib/slugify";

type Tab = "artists" | "works" | "collections";

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<Tab>("works");
  const { savedItems, toggleSaved } = useSaved();

  // Resolve saved work IDs to actual work data
  const savedWorks = useMemo(() => {
    const allWorks = getGalleryWorks();
    return savedItems
      .filter((s) => s.type === "work")
      .map((s) => {
        const work = allWorks.find((w) => w.id === s.id);
        if (!work) return null;
        return work;
      })
      .filter(Boolean);
  }, [savedItems]);

  // Derive unique artists from saved works
  const savedArtistSlugs = useMemo(() => {
    const slugs = new Set(savedWorks.map((w) => w!.artistSlug));
    return artists.filter((a) => slugs.has(a.slug));
  }, [savedWorks]);

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

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {(["works", "artists", "collections"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px cursor-pointer ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "artists" ? "Artists" : tab === "collections" ? "Collections" : "Saved Works"}
            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-full text-muted">
              {tab === "artists" ? savedArtistSlugs.length : tab === "collections" ? savedItems.filter((s) => s.type === "collection").length : savedWorks.length}
            </span>
          </button>
        ))}
      </div>

      {/* Works tab */}
      {activeTab === "works" && (
        <>
          {savedWorks.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted mb-4">No saved works yet.</p>
              <p className="text-xs text-muted mb-4">Browse artwork and tap the heart icon to save pieces you like.</p>
              <Link href="/browse" className="text-sm text-accent hover:underline">
                Browse Artwork
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {savedWorks.map((work) => (
                <div
                  key={work!.id}
                  className="bg-white border border-border rounded-sm overflow-hidden"
                >
                  <div className="relative aspect-[4/3] bg-border/20">
                    <Image
                      src={work!.image}
                      alt={work!.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-sm text-foreground mb-0.5 leading-snug">
                      {work!.title}
                    </h3>
                    <p className="text-xs text-muted mb-1">{work!.artistName}</p>
                    <p className="text-xs text-accent font-medium mb-4">
                      {work!.priceBand}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href={`/browse/${work!.artistSlug}?work=${slugify(work!.title)}`}
                        className="flex-1 text-center px-3 py-1.5 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleSaved("work", work!.id)}
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
            <div className="py-16 text-center">
              <p className="text-muted mb-4">No saved artists yet.</p>
              <p className="text-xs text-muted mb-4">Save an artist&apos;s work and they&apos;ll appear here.</p>
              <Link href="/browse" className="text-sm text-accent hover:underline">
                Browse Portfolios
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {savedArtistSlugs.map((artist) => (
                <div
                  key={artist.slug}
                  className="bg-white border border-border rounded-sm overflow-hidden"
                >
                  <div className="relative aspect-[3/4] bg-border/20">
                    <Image
                      src={artist.image}
                      alt={artist.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-sm text-foreground mb-0.5">
                      {artist.name}
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      {artist.primaryMedium} &middot; {artist.location}
                    </p>
                    <Link
                      href={`/browse/${artist.slug}`}
                      className="block text-center px-3 py-1.5 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Collections tab */}
      {activeTab === "collections" && (() => {
        const savedCollections = savedItems.filter((s) => s.type === "collection");
        return savedCollections.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted mb-4">No saved collections yet.</p>
            <p className="text-xs text-muted mb-4">Browse collections and tap the heart icon to save them.</p>
            <Link href="/browse" className="text-sm text-accent hover:underline">
              Browse Collections
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {savedCollections.map((item) => (
              <div key={item.id} className="bg-white border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded bg-accent/10 shrink-0 flex items-center justify-center">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-accent"><rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" /></svg>
                  </div>
                  <div className="min-w-0">
                    <Link href="/browse#collections" className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
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
