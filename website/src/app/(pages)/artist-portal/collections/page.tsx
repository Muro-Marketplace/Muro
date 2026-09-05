"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import UpgradePrompt from "@/components/UpgradePrompt";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { uploadImage } from "@/lib/upload";
import { useConfirm } from "@/context/ConfirmContext";
import { MAX_COLLECTION_TIERS } from "@/lib/collection-tiers";

/**
 * One size the collection is sold in, as the form holds it. Prices stay
 * strings while the artist is typing; the API coerces and validates them.
 */
interface FormTier {
  label: string;
  price: string;
  description: string;
  /** workId -> selected size label, for THIS tier only */
  workSizes: Record<string, string>;
}

interface CollectionForm {
  name: string;
  description: string;
  workIds: string[];
  /** workId -> selected size label. Used only when the collection is untiered. */
  workSizes: Record<string, string>;
  /** Empty means the collection is sold at one price, as it always was. */
  tiers: FormTier[];
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
  sizeTiers?: {
    label: string;
    price: number;
    description?: string;
    workSizes: { workId: string; sizeLabel: string }[];
  }[];
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
  tiers: [],
  bundlePrice: "",
  thumbnail: "",
  bannerImage: "",
  available: true,
};

export default function CollectionsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userCollections, setUserCollections] = useState<ServerCollection[]>([]);
  const [form, setForm] = useState<CollectionForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState<null | "thumbnail" | "banner">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // D15: publishing a collection is now 402-gated server-side, the same as
  // publishing a work. When the API refuses, show the shared upgrade prompt.
  const [upgradeOpen, setUpgradeOpen] = useState(false);
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

  /**
   * A size choice per work, filled in from each work's first size where the
   * artist has not picked one. Shared by the untiered form and by every tier,
   * so the fallback cannot drift between them.
   */
  const resolveWorkSizes = useCallback(
    (chosen: Record<string, string>) => {
      const out: { workId: string; sizeLabel: string }[] = [];
      for (const wid of form.workIds) {
        const explicit = chosen[wid];
        if (explicit) {
          out.push({ workId: wid, sizeLabel: explicit });
          continue;
        }
        const work = artist?.works.find((w) => w.id === wid);
        const firstSize = work?.pricing?.[0]?.label;
        if (firstSize) out.push({ workId: wid, sizeLabel: firstSize });
      }
      return out;
    },
    [artist, form.workIds],
  );

  /** What the works in a given size selection cost bought separately. */
  const sumIndividual = useCallback(
    (chosen: Record<string, string>) =>
      form.workIds.reduce((sum, wid) => {
        const work = artist?.works.find((w) => w.id === wid);
        if (!work) return sum;
        const sizeLabel = chosen[wid] || work.pricing?.[0]?.label;
        const sizeEntry =
          work.pricing?.find((p) => p.label === sizeLabel) || work.pricing?.[0];
        return sum + (typeof sizeEntry?.price === "number" ? sizeEntry.price : 0);
      }, 0),
    [artist, form.workIds],
  );

  const handleSave = useCallback(async () => {
    const tiered = form.tiers.length > 0;
    if (!artist || !form.name || form.workIds.length < 2) return;
    if (!tiered && !form.bundlePrice) return;

    // Tiers are checked here as well as on the server. The server is the
    // authority, this is only so the artist sees the problem beside the field
    // rather than as a rejected save.
    if (tiered) {
      const seen = new Set<string>();
      for (const tier of form.tiers) {
        const label = tier.label.trim();
        const price = parseFloat(tier.price);
        if (!label || !Number.isFinite(price) || price <= 0) {
          setFormError("Give every size a name and a price above zero.");
          return;
        }
        const key = label.toLowerCase();
        if (seen.has(key)) {
          setFormError(`Two sizes have the same name ("${label}"). Rename one.`);
          return;
        }
        seen.add(key);
      }

      // The same overpricing guard the single-price form has, run per tier:
      // one sensible tier should not vouch for an overpriced sibling.
      for (const tier of form.tiers) {
        const total = sumIndividual(tier.workSizes);
        const price = parseFloat(tier.price);
        if (total > 0 && price > total) {
          const overBy = (price - total).toFixed(0);
          const ok = await confirm({
            title: `"${tier.label.trim()}" priced above sum of works`,
            body: `The ${tier.label.trim()} set is £${overBy} more than buying those works individually. Publish anyway?`,
            confirmLabel: "Publish",
          });
          if (!ok) {
            setFormError(
              `The ${tier.label.trim()} set is £${overBy} more than the sum of its works. Lower it, or confirm publish to override.`,
            );
            return;
          }
        }
      }
    }

    const bundleNum = parseFloat(form.bundlePrice);
    if (!tiered && (!Number.isFinite(bundleNum) || bundleNum <= 0)) {
      setFormError("Bundle price must be a positive number.");
      return;
    }

    // A collection priced higher than the sum of its parts gives the
    // buyer no reason to bundle. QA flagged a "Landscapes" collection
    // saved at £300 against £180 of individual works. The form already
    // warns inline, but nothing blocked publish. Require the artist to
    // explicitly confirm before sending an overpriced bundle live.
    const individualTotal = sumIndividual(form.workSizes);
    if (!tiered && individualTotal > 0 && bundleNum > individualTotal) {
      const overBy = (bundleNum - individualTotal).toFixed(0);
      const ok = await confirm({
        title: "Bundle priced above sum of works",
        body: `This bundle is £${overBy} more than buying the works individually. Publish anyway?`,
        confirmLabel: "Publish",
      });
      if (!ok) {
        setFormError(
          `Bundle price is £${overBy} more than the sum of its works. Lower the bundle price, or confirm publish to override.`,
        );
        return;
      }
    }

    const workSizesArr = resolveWorkSizes(form.workSizes);
    const sizeTiers = form.tiers.map((tier) => ({
      label: tier.label.trim(),
      price: tier.price,
      description: tier.description.trim(),
      workSizes: resolveWorkSizes(tier.workSizes),
    }));

    const payload = {
      name: form.name,
      description: form.description,
      // A tiered collection has no single price to send: the trigger in
      // migration 136 sets bundle_price from the cheapest tier.
      bundlePrice: tiered ? "" : form.bundlePrice,
      workIds: form.workIds,
      workSizes: workSizesArr,
      sizeTiers,
      thumbnail: form.thumbnail || undefined,
      bannerImage: form.bannerImage || undefined,
      available: form.available,
    };

    setSaving(true);
    setFormError(null);

    try {
      // Not flagged by the ratchet (the verb is a ternary, not a string literal),
      // but it is still a mutating call, so migrate it too. mutate throws on a
      // non-2xx (ApiError); a 2xx without a collection is still treated as a failure.
      const data = await mutate<{ collection?: ServerCollection }>("/api/collections", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });

      if (!data.collection) {
        setFormError("Failed to save collection");
        return;
      }

      const saved: ServerCollection = data.collection;
      setUserCollections((prev) => {
        const without = prev.filter((c) => c.id !== saved.id);
        return [saved, ...without];
      });
      resetForm();
    } catch (err) {
      if (err instanceof ApiError && err.code === "subscription_required") {
        setUpgradeOpen(true);
        setFormError(err.message);
        return;
      }
      setFormError(err instanceof ApiError ? err.message || "Failed to save collection" : "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [artist, form, editingId, resetForm, confirm, resolveWorkSizes, sumIndividual]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!artist) return;
      const collection = userCollections.find((c) => c.id === id);
      const ok = await confirm({
        title: `Delete collection "${collection?.name || id}"?`,
        body: "Works in it stay in your portfolio.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      // Optimistic remove
      const prev = userCollections;
      setUserCollections(prev.filter((c) => c.id !== id));
      try {
        // mutate throws on a non-2xx or a dropped request; either way we revert
        // the optimistic remove (same as the old !res.ok / catch pair).
        await mutate(`/api/collections?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
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
        // mutate throws on a non-2xx or a dropped request, so the revert lives in
        // one catch; on success reconcile with the server's row if it returned one.
        const data = await mutate<{ collection?: ServerCollection }>("/api/collections", {
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
        if (data.collection) {
          setUserCollections((prev) =>
            prev.map((c) => (c.id === id ? data.collection! : c))
          );
        }
      } catch (err) {
        setUserCollections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, available: !nextAvailable } : c))
        );
        // D15: a publish attempt refused by the subscription gate should tell
        // the artist why the toggle snapped back, not revert in silence.
        if (err instanceof ApiError && err.code === "subscription_required") {
          setUpgradeOpen(true);
        }
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

      // Tiers pin sizes per work, so a work leaving the collection has to leave
      // every tier as well, and a work joining needs a default in each.
      const tiers = prev.tiers.map((tier) => {
        const sizes = { ...tier.workSizes };
        if (isAdding) {
          const work = artist!.works.find((w) => w.id === workId);
          const firstLabel = work?.pricing?.[0]?.label;
          if (firstLabel && !sizes[workId]) sizes[workId] = firstLabel;
        } else {
          delete sizes[workId];
        }
        return { ...tier, workSizes: sizes };
      });
      return { ...prev, workIds, workSizes: nextSizes, tiers };
    });
  }

  function setWorkSize(workId: string, sizeLabel: string) {
    setForm((prev) => ({
      ...prev,
      workSizes: { ...prev.workSizes, [workId]: sizeLabel },
    }));
  }

  /** Default sizes for a brand new tier: whatever the artist has picked so far. */
  function seedTierSizes(prev: CollectionForm): Record<string, string> {
    const sizes: Record<string, string> = {};
    for (const wid of prev.workIds) {
      const work = artist?.works.find((w) => w.id === wid);
      const label = prev.workSizes[wid] || work?.pricing?.[0]?.label;
      if (label) sizes[wid] = label;
    }
    return sizes;
  }

  function setTiered(on: boolean) {
    setForm((prev) => {
      if (!on) return { ...prev, tiers: [] };
      if (prev.tiers.length > 0) return prev;
      return {
        ...prev,
        tiers: [{ label: "", price: "", description: "", workSizes: seedTierSizes(prev) }],
      };
    });
    setFormError(null);
  }

  function addTier() {
    setForm((prev) => {
      if (prev.tiers.length >= MAX_COLLECTION_TIERS) return prev;
      // Copy the last tier's sizes so the artist adjusts rather than starts
      // from scratch each time.
      const last = prev.tiers[prev.tiers.length - 1];
      return {
        ...prev,
        tiers: [
          ...prev.tiers,
          {
            label: "",
            price: "",
            description: "",
            workSizes: last ? { ...last.workSizes } : seedTierSizes(prev),
          },
        ],
      };
    });
  }

  function removeTier(index: number) {
    setForm((prev) => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== index) }));
  }

  function updateTier(index: number, patch: Partial<FormTier>) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
    setFormError(null);
  }

  function setTierWorkSize(index: number, workId: string, sizeLabel: string) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) =>
        i === index ? { ...t, workSizes: { ...t.workSizes, [workId]: sizeLabel } } : t,
      ),
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
      tiers: (col.sizeTiers ?? []).map((tier) => {
        const sizes: Record<string, string> = {};
        for (const ws of tier.workSizes) sizes[ws.workId] = ws.sizeLabel;
        return {
          label: tier.label,
          price: String(tier.price),
          description: tier.description ?? "",
          workSizes: sizes,
        };
      }),
      thumbnail: col.thumbnail || "",
      bannerImage: col.bannerImage || "",
      available: col.available,
    });
    setEditingId(col.id);
    setShowForm(true);
    setUploadError(null);
    setFormError(null);
  }

  const tiered = form.tiers.length > 0;
  // A tiered collection has no single price to require. The per-tier names and
  // prices are checked in handleSave, so the artist gets a message naming the
  // problem instead of a button that is silently dead.
  const isFormValid =
    !!form.name.trim() &&
    form.workIds.length >= 2 &&
    (tiered || !!form.bundlePrice.trim());

  return (
    <ArtistPortalLayout activePath="/artist-portal/collections">
      <UpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Upgrade to publish collections"
        message="Publishing a collection is part of a paid Wallplace plan. Upgrade your subscription and you're back in."
      />
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
              {/* Bundle price, show £ prefix, and once we have sizes picked
                  for each work, calculate the sum-of-individual vs bundle so
                  the artist can see the saving (or, critically, if they've
                  UNDER-priced the bundle relative to individuals).
                  A tiered collection prices each size instead, so this whole
                  block steps aside for the tier editor below. */}
              {!tiered && (() => {
                // Sum individual prices from the selected works + their sizes
                const individualTotal = form.workIds.reduce((sum, wid) => {
                  const work = artist?.works.find((w) => w.id === wid);
                  if (!work) return sum;
                  const sizeLabel = form.workSizes[wid];
                  const sizeRow = (work.pricing || []).find((p) => p.label === sizeLabel) || (work.pricing || [])[0];
                  return sum + (sizeRow?.price || 0);
                }, 0);
                const bundle = parseFloat(form.bundlePrice) || 0;
                const saving = individualTotal - bundle;
                const savingPct = individualTotal > 0 && bundle > 0 ? Math.round((saving / individualTotal) * 100) : 0;

                return (
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">&pound;</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Bundle price (e.g. 450)"
                        value={form.bundlePrice}
                        onChange={(e) => setForm((p) => ({ ...p, bundlePrice: e.target.value.replace(/^£\s*/, "") }))}
                        className="w-full pl-7 pr-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                      />
                    </div>
                    {individualTotal > 0 && bundle > 0 && (
                      <div className={`mt-1.5 flex items-center gap-2 text-xs ${saving > 0 ? "text-muted" : "text-red-600"}`}>
                        <span>Individually: <span className="text-foreground font-medium">&pound;{individualTotal.toFixed(0)}</span></span>
                        <span className="opacity-40">•</span>
                        {saving > 0 ? (
                          <span>Buyers save <span className="text-green-700 font-medium">&pound;{saving.toFixed(0)} ({savingPct}%)</span></span>
                        ) : saving === 0 ? (
                          <span>No saving vs buying individually, consider dropping the bundle price</span>
                        ) : (
                          <span>Bundle is <span className="font-semibold">&pound;{Math.abs(saving).toFixed(0)} more</span> than buying individually, double-check this</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

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

              {/* Per-work size pickers. A tiered collection pins its sizes
                  inside each tier, so this is the untiered form only. */}
              {!tiered && form.workIds.length > 0 && (
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
                      if (!work) {
                        return (
                          <div
                            key={wid}
                            className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0"
                          >
                            <p className="text-xs text-muted italic">
                              Work removed from portfolio
                            </p>
                            <button
                              type="button"
                              onClick={() => toggleWork(wid)}
                              className="text-[11px] text-muted hover:text-red-600 transition-colors"
                            >
                              Remove from collection
                            </button>
                          </div>
                        );
                      }
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

              {/* Sell in several sizes. Off is the collection this form has
                  always produced: one price, one size per work. On replaces
                  both with one of each per size, because a size IS the product
                  a buyer picks. */}
              <div className="border-t border-border/40 pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="tiered"
                    checked={tiered}
                    onChange={(e) => setTiered(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm text-foreground">
                    Sell this collection in several sizes{" "}
                    <span className="text-muted">
                      (for example small, medium and large prints, each at its own price)
                    </span>
                  </span>
                </label>
              </div>

              {tiered && (
                <div className="space-y-4">
                  {form.tiers.map((tier, index) => {
                    const individualTotal = sumIndividual(tier.workSizes);
                    const price = parseFloat(tier.price) || 0;
                    const saving = individualTotal - price;
                    return (
                      <div
                        key={index}
                        className="border border-border rounded-sm p-4 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Size name (e.g. Small)"
                            value={tier.label}
                            onChange={(e) => updateTier(index, { label: e.target.value })}
                            className="flex-1 px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                          />
                          <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
                              &pound;
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Price"
                              value={tier.price}
                              onChange={(e) =>
                                updateTier(index, {
                                  price: e.target.value.replace(/^£\s*/, ""),
                                })
                              }
                              className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                            />
                          </div>
                          {form.tiers.length > 1 && (
                            <button
                              type="button"
                              data-remove-tier={index}
                              onClick={() => removeTier(index)}
                              className="text-[11px] text-muted hover:text-red-600 transition-colors px-1"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          placeholder="Short note for buyers (optional), e.g. A4 prints, unframed"
                          value={tier.description}
                          onChange={(e) => updateTier(index, { description: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/50"
                        />

                        {individualTotal > 0 && price > 0 && (
                          <p
                            className={`text-xs ${saving > 0 ? "text-muted" : "text-red-600"}`}
                          >
                            Individually:{" "}
                            <span className="text-foreground font-medium">
                              &pound;{individualTotal.toFixed(0)}
                            </span>
                            {saving > 0 ? (
                              <>
                                {" "}
                                &middot; buyers save{" "}
                                <span className="text-green-700 font-medium">
                                  &pound;{saving.toFixed(0)}
                                </span>
                              </>
                            ) : saving === 0 ? (
                              <> &middot; no saving against buying individually</>
                            ) : (
                              <>
                                {" "}
                                &middot; this size is{" "}
                                <span className="font-semibold">
                                  &pound;{Math.abs(saving).toFixed(0)} more
                                </span>{" "}
                                than buying individually, double-check it
                              </>
                            )}
                          </p>
                        )}

                        {form.workIds.length > 0 && (
                          <div className="space-y-1.5">
                            {form.workIds.map((wid) => {
                              const work = artist.works.find((w) => w.id === wid);
                              if (!work) {
                                return (
                                  <p key={wid} className="text-[11px] text-muted italic">
                                    Work removed from portfolio
                                  </p>
                                );
                              }
                              const pricing = work.pricing || [];
                              const selected =
                                tier.workSizes[wid] || pricing[0]?.label || "";
                              return (
                                <div key={wid} className="flex items-center gap-3">
                                  <span className="text-xs flex-1 truncate">
                                    {work.title}
                                  </span>
                                  {pricing.length === 0 ? (
                                    <span className="text-[11px] text-muted italic">
                                      No sizes configured
                                    </span>
                                  ) : pricing.length === 1 ? (
                                    <span className="text-[11px] text-muted">
                                      {pricing[0].label} &middot; &pound;{pricing[0].price}
                                    </span>
                                  ) : (
                                    <select
                                      data-tier={index}
                                      value={selected}
                                      onChange={(e) =>
                                        setTierWorkSize(index, wid, e.target.value)
                                      }
                                      className="px-2 py-1.5 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/50 max-w-[180px]"
                                    >
                                      {pricing.map((pr) => (
                                        <option key={pr.label} value={pr.label}>
                                          {pr.label} &middot; &pound;{pr.price}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {form.tiers.length < MAX_COLLECTION_TIERS && (
                    <button
                      type="button"
                      onClick={addTier}
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Add another size
                    </button>
                  )}
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
