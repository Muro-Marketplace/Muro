"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { collections as seedCollections } from "@/data/collections";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

interface CollectionForm {
  name: string;
  description: string;
  workIds: string[];
  bundlePrice: string;
}

interface LocalCollection {
  id: string;
  name: string;
  description: string;
  bundlePrice: string;
  workIds: string[];
  createdAt: string;
}

function getStorageKey(slug: string) {
  return `wallplace-collections-${slug}`;
}

function loadLocalCollections(slug: string): LocalCollection[] {
  try {
    const raw = localStorage.getItem(getStorageKey(slug));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCollections(slug: string, collections: LocalCollection[]) {
  try {
    localStorage.setItem(getStorageKey(slug), JSON.stringify(collections));
  } catch { /* ignore */ }
}

export default function CollectionsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userCollections, setUserCollections] = useState<LocalCollection[]>([]);
  const [form, setForm] = useState<CollectionForm>({
    name: "",
    description: "",
    workIds: [],
    bundlePrice: "",
  });

  // Load saved collections from localStorage on mount
  useEffect(() => {
    if (artist?.slug) {
      setUserCollections(loadLocalCollections(artist.slug));
    }
  }, [artist?.slug]);

  const handleSave = useCallback(async () => {
    if (!artist || !form.name || form.workIds.length < 2 || !form.bundlePrice) return;

    setSaving(true);

    const id = `${artist.slug}-collection-${Date.now()}`;
    const newCollection: LocalCollection = {
      id,
      name: form.name,
      description: form.description,
      bundlePrice: form.bundlePrice,
      workIds: form.workIds,
      createdAt: new Date().toISOString(),
    };

    // Save to localStorage immediately
    const updated = [newCollection, ...userCollections];
    setUserCollections(updated);
    saveLocalCollections(artist.slug, updated);

    // Fire-and-forget POST to API (may fail if table doesn't exist)
    authFetch("/api/collections", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        bundlePrice: form.bundlePrice,
        workIds: form.workIds,
      }),
    }).catch(() => {});

    // Reset form
    setForm({ name: "", description: "", workIds: [], bundlePrice: "" });
    setShowForm(false);
    setSaving(false);
  }, [artist, form, userCollections]);

  const handleDelete = useCallback(async (id: string) => {
    if (!artist) return;

    const updated = userCollections.filter((c) => c.id !== id);
    setUserCollections(updated);
    saveLocalCollections(artist.slug, updated);

    // Fire-and-forget DELETE to API
    authFetch(`/api/collections?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }, [artist, userCollections]);

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/collections">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  const artistCollections = seedCollections.filter((c) => c.artistSlug === artist.slug);
  const allCollections = [...artistCollections];
  const hasAnyCollections = allCollections.length > 0 || userCollections.length > 0;

  function toggleWork(workId: string) {
    setForm((prev) => ({
      ...prev,
      workIds: prev.workIds.includes(workId)
        ? prev.workIds.filter((id) => id !== workId)
        : [...prev.workIds, workId],
    }));
  }

  return (
    <ArtistPortalLayout activePath="/artist-portal/collections">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif">Collections</h1>
            <p className="text-sm text-muted mt-1">
              Bundle works into themed collections at a set price.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            {showForm ? "Cancel" : "Create Collection"}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-surface border border-border rounded-sm p-6 mb-8">
            <h2 className="text-sm font-medium mb-4">New Collection</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Collection name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />
              <input
                type="text"
                placeholder="Bundle price (e.g. 450)"
                value={form.bundlePrice}
                onChange={(e) => setForm((p) => ({ ...p, bundlePrice: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />

              <div>
                <p className="text-xs text-muted uppercase tracking-wider mb-3">Select works</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {artist.works.map((work) => {
                    const isSelected = form.workIds.includes(work.id);
                    return (
                      <div
                        key={work.id}
                        onClick={() => toggleWork(work.id)}
                        className={`relative aspect-square rounded-sm overflow-hidden cursor-pointer border-2 transition-all ${
                          isSelected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                        }`}
                      >
                        <Image src={work.image} alt={work.title} fill className="object-cover" sizes="100px" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!form.name || form.workIds.length < 2 || !form.bundlePrice || saving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Collection"}
              </button>
            </div>
          </div>
        )}

        {/* User-created collections */}
        {userCollections.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Your Collections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userCollections.map((col) => {
                const workPreviews = artist.works.filter((w) => col.workIds.includes(w.id));
                return (
                  <div key={col.id} className="bg-surface border border-border rounded-sm overflow-hidden">
                    {workPreviews.length > 0 ? (
                      <div className="grid grid-cols-3 aspect-[16/6]">
                        {workPreviews.slice(0, 3).map((work) => (
                          <div key={work.id} className="relative bg-border/20">
                            <Image src={work.image} alt={work.title} fill className="object-cover" sizes="33vw" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="aspect-[16/6] bg-border/10 flex items-center justify-center">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-muted"><rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" /></svg>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="text-sm font-medium mb-1">{col.name}</h3>
                      <p className="text-xs text-muted mb-2">
                        {col.workIds.length} works{col.bundlePrice ? ` \u00B7 \u00A3${col.bundlePrice}` : ""}
                      </p>
                      {col.description && (
                        <p className="text-xs text-muted mb-3 line-clamp-2">{col.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                          Draft
                        </span>
                        <button
                          onClick={() => handleDelete(col.id)}
                          className="text-xs text-muted hover:text-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Seed collections */}
        {artistCollections.length > 0 && (
          <div>
            {userCollections.length > 0 && (
              <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Published Collections</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {artistCollections.map((col) => (
                <div key={col.id} className="bg-surface border border-border rounded-sm overflow-hidden">
                  <div className="relative aspect-[16/9] bg-border/20">
                    <Image src={col.coverImage} alt={col.name} fill className="object-cover" sizes="50vw" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-medium mb-1">{col.name}</h3>
                    <p className="text-xs text-muted mb-2">{col.workIds.length} works &middot; {col.bundlePriceBand}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        col.available ? "bg-accent/10 text-accent" : "bg-border/50 text-muted"
                      }`}>
                        {col.available ? "Active" : "Draft"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAnyCollections && !showForm && (
          <div className="text-center py-16">
            <p className="text-muted mb-4">No collections yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Create your first collection
            </button>
          </div>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
