"use client";

import { useState } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { collections as seedCollections } from "@/data/collections";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";

interface CollectionForm {
  name: string;
  description: string;
  workIds: string[];
  bundlePrice: string;
}

export default function CollectionsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/collections">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  const artistCollections = seedCollections.filter((c) => c.artistSlug === artist.slug);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CollectionForm>({
    name: "",
    description: "",
    workIds: [],
    bundlePrice: "",
  });

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
                disabled={!form.name || form.workIds.length < 2 || !form.bundlePrice}
                className="px-5 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save Collection
              </button>
            </div>
          </div>
        )}

        {/* Existing collections */}
        {artistCollections.length > 0 ? (
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
        ) : (
          !showForm && (
            <div className="text-center py-16">
              <p className="text-muted mb-4">No collections yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-sm text-accent hover:text-accent-hover transition-colors"
              >
                Create your first collection
              </button>
            </div>
          )
        )}
      </div>
    </ArtistPortalLayout>
  );
}
