"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import EmptyState from "@/components/EmptyState";
import { authFetch } from "@/lib/api-client";
import { slugify } from "@/lib/slugify";

type ItemType = "work" | "artist" | "collection";

interface SavedItemRow {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  created_at: string;
}

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  priceBand: string;
}

interface ArtistData {
  slug: string;
  name: string;
  image: string;
  primaryMedium: string;
  location: string;
  works: ArtistWork[];
}

const tabs: { label: string; type: ItemType }[] = [
  { label: "Works", type: "work" },
  { label: "Artists", type: "artist" },
  { label: "Collections", type: "collection" },
];

function linkForItem(type: ItemType, itemId: string): string {
  switch (type) {
    case "work":
      return `/browse/${itemId}`;
    case "artist":
      return `/browse/${itemId}`;
    case "collection":
      return `/browse/collections/${encodeURIComponent(itemId)}`;
  }
}

/** Convert slug to readable name */
function formatName(raw: string): string {
  if (!raw) return "";
  if (raw.includes(" ")) return raw;
  return raw.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function ArtistSavedPage() {
  const [items, setItems] = useState<SavedItemRow[]>([]);
  const [allArtists, setAllArtists] = useState<ArtistData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ItemType>("work");
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    Promise.all([
      authFetch("/api/saved").then((r) => r.json()),
      fetch("/api/browse-artists").then((r) => r.json()),
    ])
      .then(([savedData, artistsData]) => {
        if (savedData.items) setItems(savedData.items);
        if (artistsData.artists) setAllArtists(artistsData.artists);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Build lookup maps for works and artists
  const workMap = useMemo(() => {
    const map = new Map<string, { work: ArtistWork; artistName: string; artistSlug: string }>();
    for (const artist of allArtists) {
      for (const work of artist.works || []) {
        map.set(work.id, { work, artistName: artist.name, artistSlug: artist.slug });
      }
    }
    return map;
  }, [allArtists]);

  const artistMap = useMemo(() => {
    const map = new Map<string, ArtistData>();
    for (const artist of allArtists) {
      map.set(artist.slug, artist);
    }
    return map;
  }, [allArtists]);

  async function handleRemove(item: SavedItemRow) {
    setRemoving(item.id);
    try {
      await authFetch("/api/saved", {
        method: "DELETE",
        body: JSON.stringify({ itemType: item.item_type, itemId: item.item_id }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch { /* ignore */ } finally { setRemoving(null); }
  }

  const filtered = items.filter((i) => i.item_type === activeTab);

  function renderWorkItem(item: SavedItemRow) {
    const match = workMap.get(item.item_id);
    return (
      <div key={item.id} className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {match ? (
            <div className="relative w-12 h-12 rounded overflow-hidden bg-border/20 shrink-0">
              <Image src={match.work.image} alt={match.work.title} fill className="object-cover" sizes="48px" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded bg-border/20 shrink-0 flex items-center justify-center">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-muted"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" /><path d="m21 15-5-5L5 21" strokeWidth="1.5" /></svg>
            </div>
          )}
          <div className="min-w-0">
            <Link href={match ? `/browse/${match.artistSlug}?work=${slugify(match.work.title)}` : linkForItem(item.item_type, item.item_id)} className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
              {match ? match.work.title : formatName(item.item_id)}
            </Link>
            <p className="text-xs text-muted mt-0.5 truncate">
              {match ? (
                <>{match.artistName}{match.work.priceBand ? ` \u00B7 ${match.work.priceBand}` : ""}</>
              ) : (
                <>Saved {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-muted hidden sm:inline">
            {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <button onClick={() => handleRemove(item)} disabled={removing === item.id} className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50">
            {removing === item.id ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  function renderArtistItem(item: SavedItemRow) {
    const artist = artistMap.get(item.item_id);
    return (
      <div key={item.id} className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {artist ? (
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-border/20 shrink-0">
              <Image src={artist.image} alt={artist.name} fill className="object-cover" sizes="48px" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-border/20 shrink-0 flex items-center justify-center">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-muted"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeWidth="1.5" /><circle cx="12" cy="7" r="4" strokeWidth="1.5" /></svg>
            </div>
          )}
          <div className="min-w-0">
            <Link href={linkForItem(item.item_type, item.item_id)} className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
              {artist ? artist.name : formatName(item.item_id)}
            </Link>
            <p className="text-xs text-muted mt-0.5 truncate">
              {artist ? (
                <>{artist.primaryMedium}{artist.location ? ` \u00B7 ${artist.location}` : ""}</>
              ) : (
                <>Saved {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-muted hidden sm:inline">
            {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <button onClick={() => handleRemove(item)} disabled={removing === item.id} className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50">
            {removing === item.id ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  function renderCollectionItem(item: SavedItemRow) {
    return (
      <div key={item.id} className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded bg-accent/10 shrink-0 flex items-center justify-center">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-accent"><rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" /></svg>
          </div>
          <div className="min-w-0">
            <Link href={linkForItem(item.item_type, item.item_id)} className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
              {formatName(item.item_id)}
            </Link>
            <p className="text-xs text-muted mt-0.5">
              Saved {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-muted hidden sm:inline">
            {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <button onClick={() => handleRemove(item)} disabled={removing === item.id} className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50">
            {removing === item.id ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ArtistPortalLayout activePath="/artist-portal/saved">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Saved</h1>
        <p className="text-sm text-muted mt-1">Your saved works, artists, and collections</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-4 py-2 text-sm transition-colors -mb-px ${
              activeTab === tab.type ? "text-accent border-b-2 border-accent font-medium" : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-full text-muted">
              {items.filter((i) => i.item_type === tab.type).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading saved items...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            activeTab === "work"
              ? "No saved works yet"
              : activeTab === "artist"
                ? "No saved artists yet"
                : "No saved collections yet"
          }
          hint="Tap the heart icon on anything you like and it'll appear here."
          cta={
            activeTab === "work"
              ? { label: "Browse galleries", href: "/browse" }
              : activeTab === "artist"
                ? { label: "Browse portfolios", href: "/browse?view=portfolios" }
                : { label: "Browse collections", href: "/browse?view=collections" }
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            if (activeTab === "work") return renderWorkItem(item);
            if (activeTab === "artist") return renderArtistItem(item);
            return renderCollectionItem(item);
          })}
        </div>
      )}
    </ArtistPortalLayout>
  );
}
