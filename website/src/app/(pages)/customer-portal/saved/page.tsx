"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import CustomerPortalLayout from "@/components/CustomerPortalLayout";
import EmptyState from "@/components/EmptyState";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";
import { slugify } from "@/lib/slugify";
import { useUrlState } from "@/lib/use-url-state";

type ItemType = "work" | "artist" | "collection";

interface SavedItemRow {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  created_at: string;
}

const tabs: { label: string; type: ItemType }[] = [
  { label: "Works", type: "work" },
  { label: "Artists", type: "artist" },
  { label: "Collections", type: "collection" },
];

function linkForItem(type: ItemType, itemId: string): string {
  switch (type) {
    case "work":
      // item_id format: artist-slug/work-title or just artist-slug
      return `/browse/${itemId}`;
    case "artist":
      return `/browse/${itemId}`;
    case "collection":
      return `/browse/collections/${encodeURIComponent(itemId)}`;
  }
}

function formatName(raw: string): string {
  if (!raw) return "";
  if (raw.includes(" ")) return raw;
  return raw.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface ArtistWork { id: string; title: string; image: string; }
interface ArtistData { slug: string; name: string; image: string; works: ArtistWork[]; }

export default function CustomerSavedPage() {
  // useUrlState transitively calls useSearchParams, which forces the
  // Client Component subtree to bail out of static prerender. Suspense
  // wrapping is the documented Next 16 fix (see customer-portal/messages
  // for the same pattern).
  return (
    <Suspense
      fallback={
        <CustomerPortalLayout>
          <p className="text-muted text-sm py-12 text-center">Loading saved items...</p>
        </CustomerPortalLayout>
      }
    >
      <CustomerSavedContent />
    </Suspense>
  );
}

function CustomerSavedContent() {
  const [items, setItems] = useState<SavedItemRow[]>([]);
  const [allArtists, setAllArtists] = useState<ArtistData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useUrlState<ItemType>("tab", "work");
  const [removing, setRemoving] = useState<string | null>(null);
  const { showToast } = useToast();

  const workMap = useMemo(() => {
    const map = new Map<string, { title: string; image: string; artistSlug: string; artistName: string; artistImage: string }>();
    for (const artist of allArtists) {
      for (const work of artist.works || []) {
        map.set(work.id, { title: work.title, image: work.image, artistSlug: artist.slug, artistName: artist.name, artistImage: artist.image });
      }
    }
    return map;
  }, [allArtists]);

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

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleRemove(item: SavedItemRow) {
    setRemoving(item.id);
    try {
      // E43-g: mutate() throws on a non-2xx, so the item is dropped from the list
      // ONLY on a confirmed delete. The old authFetch resolved on a 403/500, so a
      // rejected removal still vanished from the UI and reappeared on reload; the
      // catch swallowed network errors with no feedback.
      await mutate("/api/saved", {
        method: "DELETE",
        body: JSON.stringify({ itemType: item.item_type, itemId: item.item_id }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not remove this item. Please try again.", { variant: "error" });
    } finally {
      setRemoving(null);
    }
  }

  const filtered = items.filter((i) => i.item_type === activeTab);

  return (
    <CustomerPortalLayout>
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Saved</h1>
        <p className="text-sm text-muted mt-1">Your saved works, artists, and collections</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-4 py-2 text-sm transition-colors -mb-px ${
              activeTab === tab.type
                ? "text-accent border-b-2 border-accent font-medium"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
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
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.item_type === "collection" ? (
                  <div className="w-10 h-10 rounded bg-accent/10 shrink-0 flex items-center justify-center">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-accent"><rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" /></svg>
                  </div>
                ) : item.item_type === "work" && workMap.get(item.item_id)?.image ? (
                  <div className="w-10 h-10 rounded overflow-hidden bg-border/20 shrink-0 relative">
                    <Image src={workMap.get(item.item_id)!.image} alt="" fill className="object-cover" sizes="40px" />
                  </div>
                ) : item.item_type === "artist" ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-border/20 shrink-0 relative">
                    {allArtists.find((a) => a.slug === item.item_id)?.image ? (
                      <Image src={allArtists.find((a) => a.slug === item.item_id)!.image} alt="" fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeWidth="1.5" /><circle cx="12" cy="7" r="4" strokeWidth="1.5" /></svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded bg-border/20 shrink-0 flex items-center justify-center">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-muted"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" /><path d="m21 15-5-5L5 21" strokeWidth="1.5" /></svg>
                  </div>
                )}
                <div className="min-w-0">
                  {(() => {
                    const match = item.item_type === "work" ? workMap.get(item.item_id) : null;
                    const href = match
                      ? `/browse/${match.artistSlug}?work=${slugify(match.title)}`
                      : linkForItem(item.item_type, item.item_id);
                    const label = match ? match.title : formatName(item.item_id);
                    return (
                      <Link href={href} className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block">
                        {label}
                      </Link>
                    );
                  })()}
                  <p className="text-xs text-muted mt-0.5">
                    {item.item_type === "work" && workMap.has(item.item_id) && (
                      <span className="text-foreground/60">{workMap.get(item.item_id)!.artistName} · </span>
                    )}
                    Saved{" "}
                    {new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(item)}
                disabled={removing === item.id}
                className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {removing === item.id ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </CustomerPortalLayout>
  );
}
