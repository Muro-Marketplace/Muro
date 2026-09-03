"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { type ArtistWork } from "@/data/artists";
import { uploadImage } from "@/lib/upload";
import { mutate, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";
import { WORK_MEDIUM_OPTIONS } from "@/data/work-medium-options";

interface QuickAddWorkProps {
  onAdded: (work: ArtistWork) => void;
  onCancel: () => void;
}

const inputClass =
  "w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";
const labelClass = "block text-xs font-medium text-foreground mb-1";

/**
 * Compact inline "add a work" card for the profile editor's Works section.
 * Deliberately minimal, one image, a title, a medium, dimensions, a single
 * size/price tier and an availability tick box, everything else (extra
 * photos, multiple sizes, frames, shipping) stays in the full Portfolio
 * editor, linked from here.
 *
 * Posts straight to POST /api/artist-works, mirroring the id scheme and
 * upload bucket the Portfolio single-work form uses (`artworks` bucket).
 * The id can't reuse the Portfolio's `${artist.slug}-${Date.now()}` scheme
 * because this card isn't handed the artist's slug (see props below), so it
 * pairs a timestamp with a random suffix instead. artist_works.id is a
 * global primary key (see upsertWork's ownership check in
 * src/lib/db/artist-works.ts), not scoped per artist, so the random suffix
 * matters, it's what keeps two artists' quick-adds from colliding if they
 * land in the same millisecond.
 */
export default function QuickAddWork({ onAdded, onCancel }: QuickAddWorkProps) {
  const { showToast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [price, setPrice] = useState("");
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !!imageFile && !saving;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!canSave || !imageFile) return;
    setSaving(true);
    try {
      const imageUrl = await uploadImage(imageFile, "artworks");

      const parsedPrice = Number(price);
      const priceNum =
        Number.isFinite(parsedPrice) && parsedPrice > 0
          ? Math.round(parsedPrice * 100) / 100
          : 0;
      const label = sizeLabel.trim() || dimensions.trim() || "Original";
      const pricing = priceNum > 0 ? [{ label, price: priceNum }] : [];
      const priceBand = priceNum > 0 ? `From £${priceNum}` : "";

      const payload = {
        id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: title.trim(),
        image: imageUrl,
        medium,
        dimensions: dimensions.trim(),
        priceBand,
        pricing,
        available,
        color: "#C17C5A",
      };

      const res = await mutate<{ savedRow?: { id?: string } }>(
        "/api/artist-works",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const work: ArtistWork = {
        id: res?.savedRow?.id || payload.id,
        title: payload.title,
        medium: payload.medium,
        dimensions: payload.dimensions,
        priceBand: payload.priceBand,
        pricing: payload.pricing,
        available: payload.available,
        color: payload.color,
        image: payload.image,
      };
      onAdded(work);
    } catch (err) {
      if (err instanceof ApiError) {
        showToast(err.message || "Could not add this artwork. Please try again.", { variant: "error" });
      } else {
        showToast("Could not add this artwork. Please check your connection.", { variant: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-sm p-5 mb-5 bg-surface">
      <div className="grid grid-cols-1 sm:grid-cols-[112px_1fr] gap-5">
        {/* Image picker */}
        <div>
          <label className={labelClass} htmlFor="quick-add-work-image">
            Image
          </label>
          <div className="relative w-24 h-24 rounded-sm border border-dashed border-border bg-background overflow-hidden mb-2">
            {imagePreview && (
              <Image src={imagePreview} alt="" fill className="object-cover" sizes="96px" />
            )}
          </div>
          <input
            id="quick-add-work-image"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-xs w-24"
          />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Work title"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Medium</span>
              <select
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className={`${inputClass} wp-select`}
              >
                <option value="">Select medium</option>
                {WORK_MEDIUM_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Dimensions</span>
              <input
                type="text"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder="e.g. 40 x 50 cm"
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={labelClass}>Size label</span>
                <input
                  type="text"
                  value={sizeLabel}
                  onChange={(e) => setSizeLabel(e.target.value)}
                  placeholder={dimensions.trim() || "Original"}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Price (£)</span>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            <span className="text-sm text-foreground">Available to buy</span>
          </label>

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <Link
              href="/artist-portal/portfolio"
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Need sizes, frames or more photos? Use the full editor
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
