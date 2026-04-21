"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import { type ArtistWork, type SizePricing } from "@/data/artists";
import { uploadImage } from "@/lib/upload";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";

interface SizeEntry {
  label: string;
  price: number;
}

interface WorkFormState {
  title: string;
  medium: string;
  dimensions: string;
  imagePreview: string;
  additionalImages: string[];
  description: string;
  available: boolean;
  orientation: "portrait" | "landscape" | "square";
  sizes: SizeEntry[];
  shippingPrice: string;
  shippingPerSize: boolean;
  sizeShipping: string[];
  inStorePrice: string;
  inStorePricing: string[];
  detectedRatio: number | null;
  quantityAvailable: string;
  frameOptions: { label: string; priceUplift: string }[];
}

// Standard print sizes in inches [width, height] — always width <= height
const STANDARD_SIZES: [number, number, string][] = [
  [6, 4, 'A6'],
  [7, 5, '7×5"'],
  [8, 6, '8×6"'],
  [10, 8, 'A4'],
  [12, 8, '12×8"'],
  [14, 11, 'A3'],
  [16, 12, '16×12"'],
  [20, 16, 'A2'],
  [24, 16, '24×16"'],
  [24, 18, '24×18"'],
  [30, 20, 'A1'],
  [36, 24, '36×24"'],
  [40, 30, 'A0'],
];

/** Given an aspect ratio (w/h), return standard sizes that closely match */
function getSuggestedSizes(ratio: number): SizeEntry[] {
  const isLandscape = ratio >= 1;
  const normalRatio = isLandscape ? ratio : 1 / ratio;

  return STANDARD_SIZES
    .map(([w, h, name]) => {
      const sizeRatio = Math.max(w, h) / Math.min(w, h);
      const diff = Math.abs(sizeRatio - normalRatio);
      const wDisplay = isLandscape ? Math.max(w, h) : Math.min(w, h);
      const hDisplay = isLandscape ? Math.min(w, h) : Math.max(w, h);
      return { label: `${wDisplay}×${hDisplay}" (${name})`, price: 0, diff };
    })
    .filter((s) => s.diff < 0.3) // Within 30% aspect ratio tolerance
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5)
    .map(({ label, price }) => ({ label, price }));
}

const defaultSizes: SizeEntry[] = [
  { label: '10×8" (A4)', price: 0 },
];

const emptyWork: WorkFormState = {
  title: "",
  medium: "",
  dimensions: "",
  imagePreview: "",
  additionalImages: [],
  description: "",
  available: true,
  orientation: "landscape",
  sizes: [...defaultSizes],
  shippingPrice: "",
  shippingPerSize: false,
  sizeShipping: [],
  inStorePrice: "",
  inStorePricing: [],
  detectedRatio: null,
  quantityAvailable: "",
  frameOptions: [],
};

const statusColors: Record<string, string> = {
  Available: "bg-accent/10 text-accent",
  Sold: "bg-border/50 text-muted",
};

const PORTFOLIO_LIMITS: Record<string, number> = { core: 8, premium: 20, pro: 9999 };

// Total images allowed per artwork (primary + extras) by subscription tier.
const IMAGE_LIMITS: Record<string, number> = { core: 3, premium: 5, pro: 10 };

export default function PortfolioPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const { showToast } = useToast();
  const [works, setWorks] = useState<ArtistWork[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<WorkFormState>(emptyWork);
  const [hoveredWork, setHoveredWork] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState("");
  const [defaultShipping, setDefaultShipping] = useState<string>("");
  const [shipsInternationally, setShipsInternationally] = useState(false);
  const [internationalShipping, setInternationalShipping] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);

  useEffect(() => {
    if (!artist || initialised) return;
    setWorks([...artist.works]);
    setInitialised(true);
    // Fetch default shipping price
    authFetch("/api/artist-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.default_shipping_price != null) {
          setDefaultShipping(String(data.profile.default_shipping_price));
        }
        if (data.profile?.ships_internationally) {
          setShipsInternationally(true);
        }
        if (data.profile?.international_shipping_price != null) {
          setInternationalShipping(String(data.profile.international_shipping_price));
        }
      })
      .catch(() => {});
  }, [artist, initialised]);

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/portfolio">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);

    // Sync each work to Supabase
    const shownWarnings = new Set<string>();
    updated.forEach((work, index) => {
      authFetch("/api/artist-works", {
        method: "POST",
        body: JSON.stringify({
          id: work.id,
          title: work.title,
          medium: work.medium,
          dimensions: work.dimensions,
          priceBand: work.priceBand,
          pricing: work.pricing,
          available: work.available,
          color: work.color || "#C17C5A",
          image: work.image,
          orientation: work.orientation || "landscape",
          sortOrder: index,
          shippingPrice: (work as ArtistWork & { shippingPrice?: number; inStorePrice?: number }).shippingPrice ?? null,
          inStorePrice: (work as ArtistWork & { shippingPrice?: number; inStorePrice?: number }).inStorePrice ?? null,
          quantityAvailable: (work as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable ?? null,
          frameOptions: (work as ArtistWork & { frameOptions?: { label: string; priceUplift: number }[] }).frameOptions ?? [],
          description: work.description || "",
          images: work.images || [],
        }),
      })
        .then((r) => r.json())
        .then((res: { warnings?: string[] }) => {
          if (Array.isArray(res.warnings)) {
            res.warnings.forEach((w) => {
              if (!shownWarnings.has(w)) {
                shownWarnings.add(w);
                showToast(w);
              }
            });
          }
        })
        .catch((err) => console.error("Work sync error:", err));
    });
  }

  function handleDeleteWork(index: number) {
    const work = works[index];
    // Delete from Supabase
    authFetch(`/api/artist-works?id=${work.id}`, { method: "DELETE" })
      .catch((err) => console.error("Work delete error:", err));
    saveWorks(works.filter((_, i) => i !== index));
  }

  function openAdd() {
    setForm({ ...emptyWork, sizes: [...defaultSizes] });
    setEditingIndex(null);
    setShowForm(true);
  }

  function openEdit(index: number) {
    const w = works[index] as ArtistWork & { shippingPrice?: number };
    setForm({
      title: w.title,
      medium: w.medium,
      dimensions: w.dimensions,
      imagePreview: w.image,
      additionalImages: Array.isArray(w.images) ? [...w.images] : [],
      description: w.description || "",
      available: w.available,
      orientation: w.orientation || "landscape",
      sizes: w.pricing.map((p) => ({ label: p.label, price: p.price })),
      shippingPrice: w.shippingPrice != null ? String(w.shippingPrice) : "",
      shippingPerSize: false,
      sizeShipping: [],
      inStorePrice: w.inStorePrice != null ? String(w.inStorePrice) : "",
      inStorePricing: w.inStorePricing ? w.inStorePricing.map((p) => String(p.price)) : [],
      detectedRatio: null,
      quantityAvailable: (w as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable != null
        ? String((w as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable)
        : "",
      frameOptions: Array.isArray((w as ArtistWork & { frameOptions?: { label: string; priceUplift: number }[] }).frameOptions)
        ? (w as ArtistWork & { frameOptions?: { label: string; priceUplift: number }[] }).frameOptions!.map((f) => ({ label: f.label, priceUplift: String(f.priceUplift) }))
        : [],
    });
    setEditingIndex(index);
    setShowForm(true);

    // Detect ratio from existing image for size suggestions
    if (w.image) {
      const img = new window.Image();
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        setForm((p) => ({ ...p, detectedRatio: ratio }));
      };
      img.src = w.image;
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    // Detect image dimensions before upload
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    const ratio = img.naturalWidth / img.naturalHeight;
    URL.revokeObjectURL(objectUrl);

    // Auto-detect orientation
    const orientation: "landscape" | "portrait" | "square" =
      ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square";

    // Generate suggested sizes matching this ratio
    const suggested = getSuggestedSizes(ratio);
    const sizesToUse = suggested.length > 0 ? suggested : [{ label: '10×8" (A4)', price: 0 }];

    const url = await uploadImage(file, "artworks");
    setForm((p) => ({
      ...p,
      imagePreview: url,
      orientation,
      detectedRatio: ratio,
      dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
      // Only auto-set sizes if user hasn't already entered prices
      sizes: p.sizes.some((s) => s.price > 0) ? p.sizes : sizesToUse,
    }));
    setUploading(false);
  }

  async function handleAdditionalImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const plan = artist?.subscriptionPlan || "core";
    const totalLimit = IMAGE_LIMITS[plan] ?? 3;
    const extrasAllowed = Math.max(0, totalLimit - 1);
    const currentExtras = form.additionalImages.length;
    const canAdd = Math.max(0, extrasAllowed - currentExtras);

    if (canAdd === 0) {
      setFormError(`Your ${plan} plan allows ${totalLimit} image${totalLimit === 1 ? "" : "s"} per artwork.`);
      if (extraFileInputRef.current) extraFileInputRef.current.value = "";
      return;
    }

    setUploadingExtra(true);
    setFormError("");
    const toUpload = files.slice(0, canAdd);
    try {
      const urls = await Promise.all(toUpload.map((f) => uploadImage(f, "artworks")));
      const clean = urls.filter((u) => typeof u === "string" && u.length > 0);
      setForm((p) => ({ ...p, additionalImages: [...p.additionalImages, ...clean] }));
    } catch (err) {
      console.error("Additional image upload failed:", err);
      setFormError("One or more images failed to upload.");
    } finally {
      setUploadingExtra(false);
      if (extraFileInputRef.current) extraFileInputRef.current.value = "";
    }
  }

  function removeAdditionalImage(index: number) {
    setForm((p) => ({ ...p, additionalImages: p.additionalImages.filter((_, i) => i !== index) }));
  }

  function moveAdditionalImage(index: number, dir: -1 | 1) {
    setForm((p) => {
      const next = [...p.additionalImages];
      const target = index + dir;
      if (target < 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...p, additionalImages: next };
    });
  }

  function addSize() {
    setForm((p) => ({ ...p, sizes: [...p.sizes, { label: "", price: 0 }] }));
  }

  function updateSize(index: number, field: "label" | "price", value: string | number) {
    setForm((p) => ({
      ...p,
      sizes: p.sizes.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  function removeSize(index: number) {
    setForm((p) => ({ ...p, sizes: p.sizes.filter((_, i) => i !== index) }));
  }

  function handleSubmit() {
    setFormError("");

    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (form.title.length > 200) {
      setFormError("Title must be under 200 characters");
      return;
    }
    if (!form.medium.trim()) {
      setFormError("Medium is required");
      return;
    }

    const validSizes = form.sizes.filter((s) => s.label && s.price > 0);
    if (validSizes.length === 0) {
      setFormError("At least one size with a price above £0 is required");
      return;
    }
    if (validSizes.some((s) => s.price > 100000)) {
      setFormError("Price must be under £100,000");
      return;
    }

    const lowestPrice = Math.min(...validSizes.map((s) => s.price));

    const shippingVal = form.shippingPrice.trim() ? parseFloat(form.shippingPrice) : undefined;
    const inStoreVal = form.inStorePrice.trim() ? parseFloat(form.inStorePrice) : undefined;
    const qtyRaw = form.quantityAvailable.trim();
    const qtyVal = qtyRaw === "" ? null : Math.max(0, Math.floor(Number(qtyRaw)));
    const qtyFinite = qtyVal !== null && Number.isFinite(qtyVal);

    const cleanFrameOptions = form.frameOptions
      .map((f) => ({ label: f.label.trim(), priceUplift: Number(f.priceUplift) || 0 }))
      .filter((f) => f.label.length > 0);

    const newWork: ArtistWork & { shippingPrice?: number; inStorePrice?: number; quantityAvailable?: number | null; frameOptions?: { label: string; priceUplift: number }[] } = {
      id: editingIndex !== null ? works[editingIndex].id : `${artist!.slug}-${Date.now()}`,
      title: form.title,
      medium: form.medium,
      dimensions: form.dimensions,
      priceBand: `From \u00a3${lowestPrice}`,
      pricing: validSizes.map((s) => ({ label: s.label, price: s.price })),
      available: form.available && (!qtyFinite || qtyVal! > 0),
      color: "#C17C5A",
      description: form.description.trim(),
      images: form.additionalImages.filter((u) => typeof u === "string" && u.length > 0),
      image: form.imagePreview || "https://picsum.photos/seed/new-work/900/600",
      orientation: form.orientation,
      ...(shippingVal != null && !isNaN(shippingVal) ? { shippingPrice: shippingVal } : {}),
      ...(inStoreVal != null && !isNaN(inStoreVal) ? { inStorePrice: inStoreVal } : {}),
      inStorePricing: form.inStorePricing.length > 0
        ? validSizes.map((s, i) => ({ label: s.label, price: form.inStorePricing[i] ? parseFloat(form.inStorePricing[i]) : 0 })).filter((p) => p.price > 0)
        : undefined,
      quantityAvailable: qtyFinite ? qtyVal : null,
      frameOptions: cleanFrameOptions.length > 0 ? cleanFrameOptions : undefined,
    };

    let updated: ArtistWork[];
    if (editingIndex !== null) {
      updated = works.map((w, i) => (i === editingIndex ? newWork : w));
    } else {
      updated = [...works, newWork];
    }

    saveWorks(updated);
    setShowForm(false);
    setEditingIndex(null);
  }

  function deleteWork(index: number) {
    handleDeleteWork(index);
  }

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  return (
    <ArtistPortalLayout activePath="/artist-portal/portfolio">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">My Portfolio</h1>
        <div className="flex gap-2">
          <Button href="/artist-portal/profile" variant="secondary" size="sm">
            Edit Profile
          </Button>
          {(() => {
            const plan = artist?.subscriptionPlan || "core";
            const limit = PORTFOLIO_LIMITS[plan] || 8;
            const atLimit = works.length >= limit;
            return atLimit ? (
              <div className="text-right">
                <p className="text-xs text-muted">{works.length}/{limit} works</p>
                <a href="/pricing" className="text-xs text-accent hover:text-accent-hover">Upgrade for more</a>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{works.length}/{limit} works</span>
                <button onClick={openAdd} className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors">
                  + Add New Work
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Shipping Settings */}
      <div className="bg-surface border border-border rounded-sm p-5 mb-6 space-y-5">
        <h2 className="text-sm font-medium">Shipping Settings</h2>

        {/* Default UK Shipping */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium mb-0.5">Default UK Shipping</p>
            <p className="text-xs text-muted">Applied to all works unless overridden per work. System default is £9.95.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">&pound;</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultShipping}
              onChange={(e) => setDefaultShipping(e.target.value)}
              placeholder="9.95"
              className="w-24 bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* International Shipping */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium mb-0.5">International Shipping</p>
              <p className="text-xs text-muted">Enable to accept orders from outside the UK.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shipsInternationally}
              onClick={() => setShipsInternationally(!shipsInternationally)}
              className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors duration-200 cursor-pointer ${
                shipsInternationally ? "bg-accent" : "bg-border"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ${shipsInternationally ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
          {shipsInternationally && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">&pound;</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={internationalShipping}
                onChange={(e) => setInternationalShipping(e.target.value)}
                placeholder="19.95"
                className="w-24 bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
              />
              <span className="text-xs text-muted">per item</span>
            </div>
          )}
        </div>

        {/* Save all shipping settings */}
        <div className="border-t border-border pt-4">
          <button
            onClick={async () => {
              setSavingDefault(true);
              const ukVal = defaultShipping.trim() ? parseFloat(defaultShipping) : null;
              const intlVal = internationalShipping.trim() ? parseFloat(internationalShipping) : null;
              await authFetch("/api/artist-profile", {
                method: "PUT",
                body: JSON.stringify({
                  default_shipping_price: ukVal,
                  ships_internationally: shipsInternationally,
                  international_shipping_price: intlVal,
                }),
              }).catch(() => {});
              setSavingDefault(false);
            }}
            disabled={savingDefault}
            className="px-4 py-2 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {savingDefault ? "Saving..." : "Save Shipping Settings"}
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">
              {editingIndex !== null ? "Edit Work" : "Add New Work"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>

          <div className="space-y-5">
            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium mb-2">Image <span className="text-accent">*</span></label>
              <div className="flex items-start gap-4">
                {form.imagePreview ? (
                  <div className="w-36 h-28 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                    <Image src={form.imagePreview} alt="Preview" fill className="object-cover" sizes="144px" />
                  </div>
                ) : (
                  <div className="w-36 h-28 rounded-sm border-2 border-dashed border-border flex items-center justify-center shrink-0">
                    <span className="text-xs text-muted">No image</span>
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 text-sm font-medium border border-border rounded-sm hover:border-foreground/30 transition-colors"
                  >
                    {uploading ? "Uploading..." : form.imagePreview ? "Replace Image" : "Upload Image"}
                  </button>
                  <p className="text-[10px] text-muted mt-2">JPG, PNG, or WebP. Recommended minimum 1200px wide.</p>
                </div>
              </div>
            </div>

            {/* Additional images */}
            {(() => {
              const plan = artist?.subscriptionPlan || "core";
              const totalLimit = IMAGE_LIMITS[plan] ?? 3;
              const extrasAllowed = Math.max(0, totalLimit - 1);
              const used = form.additionalImages.length;
              const atLimit = used >= extrasAllowed;
              return (
                <div>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <label className="block text-sm font-medium">Additional images <span className="text-muted font-normal">(optional)</span></label>
                      <p className="text-[10px] text-muted mt-0.5">
                        Show details, textures, in-situ shots, or frame options. Primary image counts towards your total.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted">
                        {used + 1}/{totalLimit} <span className="uppercase tracking-wider">({plan})</span>
                      </p>
                      {atLimit && plan !== "pro" && (
                        <a href="/pricing" className="text-[10px] text-accent hover:text-accent-hover">Upgrade for more</a>
                      )}
                    </div>
                  </div>
                  <input
                    ref={extraFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAdditionalImageUpload}
                    className="hidden"
                  />
                  {extrasAllowed === 0 ? (
                    <p className="text-[11px] text-muted">
                      Your {plan} plan includes 1 image per artwork. <a href="/pricing" className="text-accent hover:text-accent-hover">Upgrade</a> to add more.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {form.additionalImages.map((img, i) => (
                        <div
                          key={img + i}
                          className="relative group aspect-square rounded-sm overflow-hidden bg-border/20"
                        >
                          <Image src={img} alt={`Additional ${i + 1}`} fill className="object-cover" sizes="120px" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                          <div className="absolute inset-0 flex items-start justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveAdditionalImage(i, -1)}
                                disabled={i === 0}
                                className="w-5 h-5 flex items-center justify-center bg-white/90 text-foreground rounded-sm disabled:opacity-40"
                                aria-label="Move left"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveAdditionalImage(i, 1)}
                                disabled={i === form.additionalImages.length - 1}
                                className="w-5 h-5 flex items-center justify-center bg-white/90 text-foreground rounded-sm disabled:opacity-40"
                                aria-label="Move right"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAdditionalImage(i)}
                              className="w-5 h-5 flex items-center justify-center bg-white/90 text-red-500 rounded-sm"
                              aria-label="Remove image"
                            >
                              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      {!atLimit && (
                        <button
                          type="button"
                          onClick={() => extraFileInputRef.current?.click()}
                          disabled={uploadingExtra}
                          className="aspect-square flex items-center justify-center border-2 border-dashed border-border rounded-sm text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                        >
                          <span className="text-xs">{uploadingExtra ? "Uploading..." : "+ Add"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Title + Medium */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title <span className="text-accent">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Last Light on Mare Street"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Medium <span className="text-accent">*</span></label>
                <input
                  type="text"
                  value={form.medium}
                  onChange={(e) => setForm((p) => ({ ...p, medium: e.target.value }))}
                  placeholder="e.g. 35mm Film Print"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Description <span className="text-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value.slice(0, 2000) }))}
                placeholder="Tell the story behind this piece — inspiration, process, what you were thinking when you made it. This appears on the artwork page under 'About this work'."
                rows={5}
                maxLength={2000}
                className={`${inputClass} resize-y font-serif leading-relaxed`}
              />
              <p className="text-[10px] text-muted mt-1 text-right">
                {form.description.length}/2000
              </p>
            </div>

            {/* Dimensions + Orientation */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Original Dimensions</label>
                <input
                  type="text"
                  value={form.dimensions}
                  onChange={(e) => setForm((p) => ({ ...p, dimensions: e.target.value }))}
                  placeholder="e.g. 70 x 50 cm"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Orientation</label>
                <select
                  value={form.orientation}
                  onChange={(e) => setForm((p) => ({ ...p, orientation: e.target.value as "portrait" | "landscape" | "square" }))}
                  className={inputClass}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </div>
            </div>

            {/* Sizes & Pricing */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Available Sizes & Prices <span className="text-accent">*</span></label>
                <button
                  type="button"
                  onClick={addSize}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  + Add custom size
                </button>
              </div>

              {/* Quick-add standard sizes */}
              {form.detectedRatio && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted mb-2">
                    Suggested sizes for your image ({form.orientation}, {form.detectedRatio.toFixed(2)} ratio):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getSuggestedSizes(form.detectedRatio).map((s) => {
                      const alreadyAdded = form.sizes.some((existing) => existing.label === s.label);
                      return (
                        <button
                          key={s.label}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            if (!alreadyAdded) {
                              setForm((p) => ({ ...p, sizes: [...p.sizes, { label: s.label, price: 0 }] }));
                            }
                          }}
                          className={`px-2.5 py-1 text-[11px] rounded-sm border transition-colors ${
                            alreadyAdded
                              ? "bg-accent/10 border-accent/30 text-accent cursor-default"
                              : "border-border text-muted hover:border-accent hover:text-accent cursor-pointer"
                          }`}
                        >
                          {alreadyAdded ? "✓ " : "+ "}{s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {form.sizes.map((size, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={size.label}
                      onChange={(e) => updateSize(i, "label", e.target.value)}
                      placeholder='e.g. 12×16" (A3)'
                      className={`${inputClass} flex-1`}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm text-muted">&pound;</span>
                      <input
                        type="number"
                        min={0}
                        value={size.price || ""}
                        onChange={(e) => updateSize(i, "price", Number(e.target.value) || 0)}
                        placeholder="Price"
                        className="w-24 bg-background border border-border rounded-sm px-3 py-3 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
                      />
                    </div>
                    {form.sizes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSize(i)}
                        className="text-muted hover:text-red-500 transition-colors shrink-0"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-2">Set a price for each size. You can type custom sizes or use the suggestions above.</p>
            </div>

            {/* Shipping price */}
            <div>
              <label className="block text-sm font-medium mb-2">Shipping Price</label>
              {!form.shippingPerSize && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">&pound;</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.shippingPrice}
                    onChange={(e) => setForm((p) => ({ ...p, shippingPrice: e.target.value }))}
                    placeholder={defaultShipping || "9.95"}
                    className="w-32 bg-background border border-border rounded-sm px-3 py-3 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shippingPerSize}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((p) => ({
                      ...p,
                      shippingPerSize: checked,
                      sizeShipping: checked ? p.sizes.map(() => "") : [],
                    }));
                  }}
                  className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
                />
                <span className="text-xs text-muted">Set different shipping per size</span>
              </label>
              {form.shippingPerSize && (
                <div className="mt-3 space-y-2">
                  {form.sizes.map((size, i) => (
                    size.label.trim() ? (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted w-28 truncate">{size.label}</span>
                        <span className="text-xs text-muted">&pound;</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.sizeShipping[i] || ""}
                          onChange={(e) => setForm((p) => {
                            const updated = [...p.sizeShipping];
                            updated[i] = e.target.value;
                            return { ...p, sizeShipping: updated };
                          })}
                          placeholder={defaultShipping || "9.95"}
                          className="w-20 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground text-right focus:outline-none focus:border-accent/60"
                        />
                      </div>
                    ) : null
                  ))}
                </div>
              )}
              {!form.shippingPerSize && (
                <p className="text-[10px] text-muted mt-1.5">
                  Leave blank to use your default ({defaultShipping ? `£${parseFloat(defaultShipping).toFixed(2)}` : "£9.95"}). Set to 0 for free shipping.
                </p>
              )}
            </div>

            {/* In-store price per size */}
            <div>
              <label className="block text-sm font-medium mb-2">In-Store Prices <span className="text-muted font-normal">(optional)</span></label>
              <p className="text-[10px] text-muted mb-3">
                Set prices for the original piece when displayed in a venue. Customers can buy in person with no shipping. Leave blank for sizes not available in store.
              </p>
              <div className="space-y-2">
                {form.sizes.map((size, i) => (
                  size.label.trim() ? (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-28 truncate">{size.label}</span>
                      <span className="text-xs text-muted">&pound;</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.inStorePricing?.[i] || ""}
                        onChange={(e) => setForm((p) => {
                          const updated = [...(p.inStorePricing || p.sizes.map(() => ""))];
                          updated[i] = e.target.value;
                          return { ...p, inStorePricing: updated };
                        })}
                        placeholder="Not in store"
                        className="w-24 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground text-right focus:outline-none focus:border-accent/60"
                      />
                    </div>
                  ) : null
                ))}
              </div>
            </div>

            {/* Available toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, available: !p.available }))}
                  className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                    form.available ? "bg-accent border-accent" : "bg-white border-border"
                  }`}
                >
                  {form.available && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
                </button>
                <span className="text-sm">Available for purchase</span>
              </label>
            </div>

            {/* Quantity available */}
            <div>
              <label className="block text-sm font-medium mb-1">Quantity available (optional)</label>
              <p className="text-xs text-muted mb-2">Leave blank for unlimited (e.g. print-on-demand). Enter a number if you have a fixed number of units.</p>
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantityAvailable}
                onChange={(e) => setForm((p) => ({ ...p, quantityAvailable: e.target.value }))}
                placeholder="e.g. 10"
                className="w-32 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
              />
            </div>

            {/* Frame options */}
            <div>
              <label className="block text-sm font-medium mb-1">Frame options (optional)</label>
              <p className="text-xs text-muted mb-3">Offer framed variants. Leave blank if you only sell unframed. Price uplift is added on top of the size price.</p>
              <div className="space-y-2">
                {form.frameOptions.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => setForm((p) => {
                        const next = [...p.frameOptions];
                        next[i] = { ...next[i], label: e.target.value };
                        return { ...p, frameOptions: next };
                      })}
                      placeholder="e.g. Black oak frame"
                      maxLength={80}
                      className="flex-1 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted">+£</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={f.priceUplift}
                        onChange={(e) => setForm((p) => {
                          const next = [...p.frameOptions];
                          next[i] = { ...next[i], priceUplift: e.target.value };
                          return { ...p, frameOptions: next };
                        })}
                        placeholder="0"
                        className="w-20 bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, frameOptions: p.frameOptions.filter((_, j) => j !== i) }))}
                      className="w-8 h-8 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                      aria-label="Remove frame option"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, frameOptions: [...p.frameOptions, { label: "", priceUplift: "" }] }))}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  + Add frame option
                </button>
              </div>
            </div>

            {/* Error message */}
            {formError && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formError}
              </p>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!form.title || !form.medium || form.sizes.filter((s) => s.label && s.price > 0).length === 0}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingIndex !== null ? "Save Changes" : "Add Work"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Works grid */}
      <div className="bg-surface border border-border rounded-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium">Works ({works.length})</h2>
        </div>

        {works.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-4">No works yet. Add your first piece to get started.</p>
            <button onClick={openAdd} className="text-sm text-accent hover:text-accent-hover transition-colors">
              + Add your first work
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {works.map((work, index) => (
              <div
                key={work.id}
                className="relative group rounded-sm overflow-hidden border border-border"
                onMouseEnter={() => setHoveredWork(index)}
                onMouseLeave={() => setHoveredWork(null)}
              >
                <div className="aspect-[4/3] relative bg-border/20">
                  <Image src={work.image} alt={work.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                </div>

                {hoveredWork === index && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 transition-opacity">
                    <button
                      onClick={() => openEdit(index)}
                      className="text-xs font-medium bg-white text-foreground px-4 py-1.5 rounded-sm hover:bg-background transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm("Remove this work?")) deleteWork(index); }}
                      className="text-xs text-white/60 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <div className="p-3 border-t border-border">
                  <p className="text-xs font-medium text-foreground leading-snug truncate mb-1">{work.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{work.medium}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      work.available ? statusColors.Available : statusColors.Sold
                    }`}>
                      {work.available ? "Available" : "Sold"}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1">{work.pricing.length} size{work.pricing.length !== 1 ? "s" : ""} from {work.priceBand.replace("From ", "")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
