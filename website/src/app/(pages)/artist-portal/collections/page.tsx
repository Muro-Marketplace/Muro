"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/upload";

interface CollectionForm {
  name: string;
  description: string;
  workIds: string[];
  bundlePrice: string;
  thumbnail: string;
  bannerImage: string;
  available: boolean;
}

interface LocalCollection {
  id: string;
  name: string;
  description: string;
  bundlePrice: string;
  workIds: string[];
  thumbnail?: string;
  bannerImage?: string;
  available?: boolean;
  createdAt: string;
}

const EMPTY_FORM: CollectionForm = {
  name: "",
  description: "",
  workIds: [],
  bundlePrice: "",
  thumbnail: "",
  bannerImage: "",
  available: true,
};

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
  } catch {
    /* ignore */
  }
}

export default function CollectionsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userCollections, setUserCollections] = useState<LocalCollection[]>([]);
  const [form, setForm] = useState<CollectionForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState<null | "thumbnail" | "banner">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (artist?.slug) {
      setUserCollections(loadLocalCollections(artist.slug));
    }
  }, [artist?.slug]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setUploadError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!artist || !form.name || form.workIds.length < 2 || !form.bundlePrice) return;

    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description,
      bundlePrice: form.bundlePrice,
      workIds: form.workIds,
      thumbnail: form.thumbnail || undefined,
      bannerImage: form.bannerImage || undefined,
      available: form.available,
    };

    if (editingId) {
      const updated = userCollections.map((c) =>
        c.id === editingId
          ? {
              ...c,
              name: form.name,
              description: form.description,
              bundlePrice: form.bundlePrice,
              workIds: form.workIds,
              thumbnail: form.thumbnail || undefined,
              bannerImage: form.bannerImage || undefined,
              available: form.available,
            }
          : c
      );
      setUserCollections(updated);
      saveLocalCollections(artist.slug, updated);

      authFetch("/api/collections", {
        method: "PATCH",
        body: JSON.stringify({ id: editingId, ...payload }),
      }).catch(() => {});
    } else {
      const id = `${artist.slug}-collection-${Date.now()}`;
      const newCollection: LocalCollection = {
        id,
        name: form.name,
        description: form.description,
        bundlePrice: form.bundlePrice,
        workIds: form.workIds,
        thumbnail: form.thumbnail || undefined,
        bannerImage: form.bannerImage || undefined,
        available: form.available,
        createdAt: new Date().toISOString(),
      };
      const updated = [newCollection, ...userCollections];
      setUserCollections(updated);
      saveLocalCollections(artist.slug, updated);

      authFetch("/api/collections", {
        method: "POST",
        body: JSON.stringify(payload),
      }).catch(() => {});
    }

    resetForm();
    setSaving(false);
  }, [artist, form, userCollections, editingId, resetForm]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!artist) return;
      const updated = userCollections.filter((c) => c.id !== id);
      setUserCollections(updated);
      saveLocalCollections(artist.slug, updated);

      authFetch(`/api/collections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    [artist, userCollections]
  );

  const toggleAvailability = useCallback(
    (id: string) => {
      if (!artist) return;
      const target = userCollections.find((c) => c.id === id);
      if (!target) return;
      const nextAvailable = !(target.available ?? true);
      const updated = userCollections.map((c) =>
        c.id === id ? { ...c, available: nextAvailable } : c
      );
      setUserCollections(updated);
      saveLocalCollections(artist.slug, updated);

      authFetch("/api/collections", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          name: target.name,
          description: target.description,
          bundlePrice: target.bundlePrice,
          workIds: target.workIds,
          thumbnail: target.thumbnail,
          bannerImage: target.bannerImage,
          available: nextAvailable,
        }),
      }).catch(() => {});
    },
    [artist, userCollections]
  );

  async function handleImageUpload(
    field: "thumbnail" | "banner",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(field);
    setUploadError(null);
    try {
      const url = await uploadImage(file, "collections");
      setForm((p) => ({
        ...p,
        [field === "thumbnail" ? "thumbnail" : "bannerImage"]: url,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/collections">
        <p className="text-muted text-sm py-12 text-center">
          {artistLoading ? "Loading..." : "No artist profile found."}
        </p>
      </ArtistPortalLayout>
    );
  }

  function toggleWork(workId: string) {
    setForm((prev) => ({
      ...prev,
      workIds: prev.workIds.includes(workId)
        ? prev.workIds.filter((id) => id !== workId)
        : [...prev.workIds, workId],
    }));
  }

  function openEdit(col: LocalCollection) {
    setForm({
      name: col.name,
      description: col.description,
      bundlePrice: col.bundlePrice,
      workIds: col.workIds,
      thumbnail: col.thumbnail || "",
      bannerImage: col.bannerImage || "",
      available: col.available ?? true,
    });
    setEditingId(col.id);
    setShowForm(true);
    setUploadError(null);
  }

  const isFormValid =
    !!form.name.trim() && form.workIds.length >= 2 && !!form.bundlePrice.trim();

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
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                setForm(EMPTY_FORM);
                setEditingId(null);
                setShowForm(true);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            {showForm ? "Cancel" : "Create Collection"}
          </button>
        </div>

        {/* Create/edit form */}
        {showForm && (
          <div className="bg-surface border border-border rounded-sm p-6 mb-8">
            <h2 className="text-sm font-medium mb-4">
              {editingId ? "Edit Collection" : "New Collection"}
            </h2>
            <div className="space-y-5">
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
                inputMode="decimal"
                placeholder="Bundle price (e.g. 450)"
                value={form.bundlePrice}
                onChange={(e) => setForm((p) => ({ ...p, bundlePrice: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />

              {/* Images */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Thumbnail */}
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">
                    Thumbnail <span className="normal-case text-muted/70">(square, shown on cards)</span>
                  </p>
                  <div className="relative w-full aspect-square rounded-sm overflow-hidden bg-border/20 border border-dashed border-border flex items-center justify-center text-xs text-muted mb-3">
                    {form.thumbnail ? (
                      <Image
                        src={form.thumbnail}
                        alt="Thumbnail preview"
                        fill
                        className="object-cover"
                        sizes="300px"
                        unoptimized
                      />
                    ) : (
                      <span>No thumbnail selected</span>
                    )}
                  </div>

                  {artist.works.length > 0 && (
                    <>
                      <p className="text-[11px] text-muted mb-1.5">Select from your works</p>
                      <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-2 scrollbar-none">
                        {artist.works.map((work) => {
                          const isSelected = form.thumbnail === work.image;
                          return (
                            <button
                              key={work.id}
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  thumbnail: isSelected ? "" : work.image,
                                }))
                              }
                              className={`relative shrink-0 w-14 h-14 rounded-sm overflow-hidden border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-accent shadow-sm"
                                  : "border-transparent hover:border-border"
                              }`}
                              title={work.title}
                            >
                              <Image
                                src={work.image}
                                alt={work.title}
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => handleImageUpload("thumbnail", e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => thumbnailInputRef.current?.click()}
                      disabled={uploading === "thumbnail"}
                      className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-60"
                    >
                      {artist.works.length > 0 ? "Or upload image" : "Upload image"}
                      {uploading === "thumbnail" ? "…" : ""}
                    </button>
                    {form.thumbnail && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, thumbnail: "" }))}
                        className="text-[11px] text-muted hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner */}
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">
                    Banner <span className="normal-case text-muted/70">(16:9, shown on detail page)</span>
                  </p>
                  <div className="relative w-full aspect-[16/9] rounded-sm overflow-hidden bg-border/20 border border-dashed border-border flex items-center justify-center text-xs text-muted mb-3">
                    {form.bannerImage ? (
                      <Image
                        src={form.bannerImage}
                        alt="Banner preview"
                        fill
                        className="object-cover"
                        sizes="600px"
                        unoptimized
                      />
                    ) : (
                      <span>No banner selected</span>
                    )}
                  </div>

                  {artist.works.length > 0 && (
                    <>
                      <p className="text-[11px] text-muted mb-1.5">Select from your works</p>
                      <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-2 scrollbar-none">
                        {artist.works.map((work) => {
                          const isSelected = form.bannerImage === work.image;
                          return (
                            <button
                              key={work.id}
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  bannerImage: isSelected ? "" : work.image,
                                }))
                              }
                              className={`relative shrink-0 w-14 h-14 rounded-sm overflow-hidden border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-accent shadow-sm"
                                  : "border-transparent hover:border-border"
                              }`}
                              title={work.title}
                            >
                              <Image
                                src={work.image}
                                alt={work.title}
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => handleImageUpload("banner", e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={uploading === "banner"}
                      className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-60"
                    >
                      {artist.works.length > 0 ? "Or upload image" : "Upload image"}
                      {uploading === "banner" ? "…" : ""}
                    </button>
                    {form.bannerImage && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, bannerImage: "" }))}
                        className="text-[11px] text-muted hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {uploadError && (
                <p className="text-xs text-red-600">{uploadError}</p>
              )}

              {/* Works */}
              <div>
                <p className="text-xs text-muted uppercase tracking-wider mb-3">
                  Select works <span className="normal-case text-muted/70">(min 2)</span>
                </p>
                {artist.works.length === 0 ? (
                  <p className="text-xs text-muted">Add works to your portfolio to build a collection.</p>
                ) : (
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
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                  <polyline points="2 7 5.5 10.5 12 3.5" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Availability */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => setForm((p) => ({ ...p, available: e.target.checked }))}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-sm text-foreground">
                  Publish to marketplace <span className="text-muted">(uncheck to save as draft)</span>
                </span>
              </label>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!isFormValid || saving || uploading !== null}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : editingId ? "Update Collection" : "Save Collection"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User-created collections */}
        {userCollections.length > 0 ? (
          <div className="mb-6">
            <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Your Collections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userCollections.map((col) => {
                const workPreviews = artist.works.filter((w) => col.workIds.includes(w.id));
                const isPublished = col.available ?? true;
                return (
                  <div key={col.id} className="bg-surface border border-border rounded-sm overflow-hidden">
                    {col.bannerImage ? (
                      <div className="relative aspect-[16/6] bg-border/20">
                        <Image
                          src={col.bannerImage}
                          alt={col.name}
                          fill
                          className="object-cover"
                          sizes="50vw"
                          unoptimized
                        />
                      </div>
                    ) : col.thumbnail ? (
                      <div className="relative aspect-[16/6] bg-border/20">
                        <Image
                          src={col.thumbnail}
                          alt={col.name}
                          fill
                          className="object-cover"
                          sizes="50vw"
                          unoptimized
                        />
                      </div>
                    ) : workPreviews.length > 0 ? (
                      <div className="grid grid-cols-3 aspect-[16/6]">
                        {workPreviews.slice(0, 3).map((work) => (
                          <div key={work.id} className="relative bg-border/20">
                            <Image src={work.image} alt={work.title} fill className="object-cover" sizes="33vw" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="aspect-[16/6] bg-border/10 flex items-center justify-center">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-muted">
                          <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5" />
                          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeWidth="1.5" />
                        </svg>
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
                        <button
                          onClick={() => toggleAvailability(col.id)}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
                            isPublished
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-border/50 text-muted hover:bg-border"
                          }`}
                          title={isPublished ? "Click to unpublish" : "Click to publish"}
                        >
                          {isPublished ? "Published" : "Draft"}
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEdit(col)}
                            className="text-xs text-accent hover:text-accent-hover transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(col.id)}
                            className="text-xs text-muted hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-16">
              <p className="text-muted mb-4">No collections yet.</p>
              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setEditingId(null);
                  setShowForm(true);
                }}
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
