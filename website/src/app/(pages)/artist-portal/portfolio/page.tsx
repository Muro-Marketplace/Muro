"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import { artists, type ArtistWork, type SizePricing } from "@/data/artists";

const artist = artists[0];

interface SizeEntry {
  label: string;
  price: number;
}

interface WorkFormState {
  title: string;
  medium: string;
  dimensions: string;
  imagePreview: string;
  available: boolean;
  orientation: "portrait" | "landscape" | "square";
  sizes: SizeEntry[];
}

const defaultSizes: SizeEntry[] = [
  { label: '8\u00d710" (A4)', price: 0 },
];

const emptyWork: WorkFormState = {
  title: "",
  medium: "",
  dimensions: "",
  imagePreview: "",
  available: true,
  orientation: "landscape",
  sizes: [...defaultSizes],
};

const statusColors: Record<string, string> = {
  Available: "bg-accent/10 text-accent",
  Sold: "bg-border/50 text-muted",
};

export default function PortfolioPage() {
  const [works, setWorks] = useState<ArtistWork[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<WorkFormState>(emptyWork);
  const [hoveredWork, setHoveredWork] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("wallspace-artist-works");
    if (stored) {
      try { setWorks(JSON.parse(stored)); return; } catch { /* ignore */ }
    }
    setWorks([...artist.works]);
  }, []);

  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);
    localStorage.setItem("wallspace-artist-works", JSON.stringify(updated));
  }

  function openAdd() {
    setForm({ ...emptyWork, sizes: [...defaultSizes] });
    setEditingIndex(null);
    setShowForm(true);
  }

  function openEdit(index: number) {
    const w = works[index];
    setForm({
      title: w.title,
      medium: w.medium,
      dimensions: w.dimensions,
      imagePreview: w.image,
      available: w.available,
      orientation: w.orientation || "landscape",
      sizes: w.pricing.map((p) => ({ label: p.label, price: p.price })),
    });
    setEditingIndex(index);
    setShowForm(true);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((p) => ({ ...p, imagePreview: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
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
    const validSizes = form.sizes.filter((s) => s.label && s.price > 0);
    if (validSizes.length === 0) return;

    const lowestPrice = Math.min(...validSizes.map((s) => s.price));

    const newWork: ArtistWork = {
      id: editingIndex !== null ? works[editingIndex].id : `${artist.slug}-${Date.now()}`,
      title: form.title,
      medium: form.medium,
      dimensions: form.dimensions,
      priceBand: `From \u00a3${lowestPrice}`,
      pricing: validSizes.map((s) => ({ label: s.label, price: s.price })),
      available: form.available,
      color: "#C17C5A",
      image: form.imagePreview || "https://picsum.photos/seed/new-work/900/600",
      orientation: form.orientation,
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
    saveWorks(works.filter((_, i) => i !== index));
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
          <button
            onClick={openAdd}
            className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            + Add New Work
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
                    {form.imagePreview ? "Replace Image" : "Upload Image"}
                  </button>
                  <p className="text-[10px] text-muted mt-2">JPG, PNG, or WebP. Recommended minimum 1200px wide.</p>
                </div>
              </div>
            </div>

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
                  + Add size
                </button>
              </div>
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
              <p className="text-[10px] text-muted mt-2">Add each size you offer with its price. Venues and buyers will choose from these options.</p>
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
