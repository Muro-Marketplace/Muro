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
  /** workId -> selected size label */
  workSizes: Record<string, string>;
  bundlePrice: string;
  thumbnail: string;
  bannerImage: string;
  available: boolean;
}

interface ServerCollection {
  id: string;
  artistSlug: string;
  name: string;
  description: string;
  bundlePrice: string;
  workIds: string[];
  workSizes: { workId: string; sizeLabel: string }[];
  thumbnail?: string;
  bannerImage?: string;
  available: boolean;
  createdAt: string;
}

const EMPTY_FORM: CollectionForm = {
  name: "",
  description: "",
  workIds: [],
  workSizes: {},
  bundlePrice: "",
  thumbnail: "",
  bannerImage: "",
  available: true,
};

export default function CollectionsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userCollections, setUserCollections] = useState<ServerCollection[]>([]);
  const [form, setForm] = useState<CollectionForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState<null | "thumbnail" | "banner">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  // Load from DB on mount / when artist changes
  useEffect(() => {
    if (!artist) return;
    let cancelled = false;
    setLoadingList(true);
    authFetch("/api/collections")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setUserCollections(data.collections || []);
      })
      .catch(() => {
        if (!cancelled) setUserCollections([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artist]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setUploadError(null);
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!artist || !form.name || form.workIds.length < 2 || !form.bundlePrice) return;

    // Convert workSizes record -> array. For works with no explicit choice,
    // fall back to the first pricing entry (if any).
    const workSizesArr: { workId: string; sizeLabel: string }[] = [];
    for (const wid of form.workIds) {
      const explicit = form.workSizes[wid];
      if (explicit) {
        workSizesArr.push({ workId: wid, sizeLabel: explicit });
        continue;
      }
      const work = artist.works.find((w) => w.id === wid);
      const firstSize = work?.pricing?.[0]?.label;
      if (firstSize) workSizesArr.push({ workId: wid, sizeLabel: firstSize });
    }

    const payload = {
      name: form.name,
      description: form.description,
      bundlePrice: form.bundlePrice,
      workIds: form.workIds,
      workSizes: workSizesArr,
      thumbnail: form.thumbnail || undefined,
      bannerImage: form.bannerImage || undefined,
      available: form.available,
    };

    setSaving(true);
    setFormError(null);

    try {
      const res = await authFetch(
        editingId ? "/api/collections" : "/api/collections",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
        }
      );
      const data = await res.json();

      if (!res.ok || !data.collection) {
        setFormError(data.error || "Failed to save collection");
        return;
      }

      const saved: ServerCollection = data.collection;
      setUserCollections((prev) => {
        const without = prev.filter((c) => c.id !== saved.id);
        return [saved, ...without];
      });
      resetForm();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [artist, form, editingId, resetForm]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!artist) return;
      // Optimistic remove
      const prev = userCollections;
      setUserCollections(prev.filter((c) => c.id !== id));
      try {
        const res = await authFetch(`/api/collections?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          // Revert on failure
          setUserCollections(prev);
        }
      } catch {
        setUserCollections(prev);
      }
    },
    [artist, userCollections]
  );

  const toggleAvailability = useCallback(
    async (id: string) => {
      if (!artist) return;
      const target = userCollections.find((c) => c.id === id);
      if (!target) return;
      const nextAvailable = !target.available;

      // Optimistic update
      setUserCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, available: nextAvailable } : c))
      );

      try {
        const res = await authFetch("/api/collections", {
          method: "PATCH",
          body: JSON.stringify({
            id,
            name: target.name,
            description: target.description,
            bundlePrice: target.bundlePrice,
            workIds: target.workIds,
            workSizes: target.workSizes,
            thumbnail: target.thumbnail,
            bannerImage: target.bannerImage,
            available: nextAvailable,
          }),
        });
        if (!res.ok) {
          // Revert
          setUserCollections((prev) =>
            prev.map((c) => (c.id === id ? { ...c, available: !nextAvailable } : c))
          );
        } else {
          const data = await res.json();
          if (data.collection) {
            setUserCollections((prev) =>
              prev.map((c) => (c.id === id ? data.collection : c))
            );
          }
        }
      } catch {
        setUserCollections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, available: !nextAvailable } : c))
        );
      }
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
    setForm((prev) => {
      const isAdding = !prev.workIds.includes(workId);
      const workIds = isAdding
        ? [...prev.workIds, workId]
        : prev.workIds.filter((id) => id !== workId);

      // When adding, default size to the first pricing entry. When removing, drop it.
      const nextSizes = { ...prev.workSizes };
      if (isAdding) {
        const work = artist!.works.find((w) => w.id === workId);
        const firstLabel = work?.pricing?.[0]?.label;
        if (firstLabel && !nextSizes[workId]) nextSizes[workId] = firstLabel;
      } else {
        delete nextSizes[workId];
      }
      return { ...prev, workIds, workSizes: nextSizes };
    });
  }

  function setWorkSize(workId: string, sizeLabel: string) {
    setForm((prev) => ({
      ...prev,
      workSizes: { ...prev.workSizes, [workId]: sizeLabel },
    }));
  }

  function openEdit(col: ServerCollection) {
    const workSizes: Record<string, string> = {};
    for (const ws of col.workSizes) workSizes[ws.workId] = ws.sizeLabel;
    setForm({
      name: col.name,
      description: col.description,
      bundlePrice: col.bundlePrice,
      workIds: col.workIds,
      workSizes,
      thumbnail: col.thumbnail || "",
      bannerImage: col.bannerImage || "",
      available: col.available,
    });
    setEditingId(col.id);
    setShowForm(true);
    setUploadError(null);
    setFormError(null);
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

              {/* Per-work size pickers */}
              {form.workIds.length > 0 && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider mb-3">
                    Size for each work{" "}
                    <span className="normal-case text-muted/70">
                      (shown to buyers on the collection page)
                    </span>
                  </p>
                  <div className="space-y-2">
                    {form.workIds.map((wid) => {
                      const work = artist.works.find((w) => w.id === wid);
                      if (!work) return null;
                      const pricing = work.pricing || [];
                      const selected = form.workSizes[wid] || pricing[0]?.label || "";
                      return (
                        <div
                          key={wid}
                          className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0"
                        >
                          <div className="relative w-10 h-10 rounded-sm overflow-hidden bg-border/20 shrink-0">
                            <Image
                              src={work.image}
                              alt={work.title}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{work.title}</p>
                            <p className="text-[11px] text-muted truncate">
                              {work.medium}
                            </p>
                          </div>
                          {pricing.length === 0 ? (
                            <span className="text-[11px] text-muted italic">
                              No sizes configured
                            </span>
                          ) : pricing.length === 1 ? (
                            <span className="text-xs text-muted">
                              {pricing[0].label} · £{pricing[0].price}
                            </span>
                          ) : (
                            <select
                              value={selected}
                              onChange={(e) => setWorkSize(wid, e.target.value)}
                              className="px-2 py-1.5 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/50 max-w-[180px]"
                            >
                              {pricing.map((p) => (
                                <option key={p.label} value={p.label}>
                                  {p.label} · £{p.price}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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

              {formError && <p className="text-xs text-red-600">{formError}</p>}

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
        {loadingList ? (
          <p className="text-muted text-sm py-12 text-center">Loading your collections...</p>
        ) : userCollections.length > 0 ? (
          <div className="mb-6">
            <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Your Collections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userCollections.map((col) => {
                const workPreviews = artist.works.filter((w) => col.workIds.includes(w.id));
                const isPublished = col.available;
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
