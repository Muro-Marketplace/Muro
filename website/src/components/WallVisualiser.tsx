"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Wall visualiser — lets a buyer upload a photo of their wall and see the
 * selected artwork overlaid on it at scale. Phase 1 is a CSS-only overlay
 * (opacity + drag / scale) that works without any model inference. Phase 2
 * will swap to a real "view in room" service (Replicate SDXL inpaint or
 * similar) behind /api/visualise — the component's public API stays the same.
 *
 * Product decision needed: whether to bake in a full AI inpaint call
 * (higher fidelity, pennies per render, needs Replicate account + a spend
 * cap) or stick with the lightweight overlay. Scaffold here ships the
 * overlay version so the feature is usable today.
 */
interface Props {
  artworkImage: string;
  artworkTitle: string;
  artworkWidthCm?: number | null;
  artworkHeightCm?: number | null;
}

export default function WallVisualiser({ artworkImage, artworkTitle, artworkWidthCm, artworkHeightCm }: Props) {
  const [wallPhoto, setWallPhoto] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [xPct, setXPct] = useState(50);
  const [yPct, setYPct] = useState(50);

  async function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setWallPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  const dimensionHint = artworkWidthCm && artworkHeightCm
    ? `${artworkWidthCm} × ${artworkHeightCm} cm`
    : null;

  return (
    <div className="border border-border rounded-sm bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent">See it on your wall</p>
          <p className="text-sm text-foreground">Upload a photo of your space and scale the piece to size.</p>
        </div>
        {dimensionHint && <p className="text-xs text-muted">Actual size: {dimensionHint}</p>}
      </div>

      {!wallPhoto ? (
        <label className="flex flex-col items-center justify-center aspect-[4/3] border border-dashed border-border rounded-sm cursor-pointer hover:border-accent/50 transition-colors bg-background">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted mb-2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-sm text-foreground mb-1">Upload a photo of your wall</p>
          <p className="text-[11px] text-muted">JPG or PNG · processed in your browser only</p>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      ) : (
        <>
          <div className="relative aspect-[4/3] rounded-sm overflow-hidden bg-background select-none">
            {/* User's wall */}
            <img src={wallPhoto} alt="Your wall" className="absolute inset-0 w-full h-full object-cover" />

            {/* Artwork overlay — positioned by percentage + scaled. Drag by
                clicking anywhere on the preview; for v1 we just re-centre
                on click rather than implement free drag. */}
            <button
              type="button"
              aria-label="Re-centre artwork"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setXPct(((e.clientX - rect.left) / rect.width) * 100);
                setYPct(((e.clientY - rect.top) / rect.height) * 100);
              }}
              className="absolute inset-0"
            >
              <span
                className="absolute shadow-2xl"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  width: `${30 * scale}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <Image
                  src={artworkImage}
                  alt={artworkTitle}
                  width={600}
                  height={600}
                  className="w-full h-auto ring-2 ring-white/40"
                  unoptimized
                />
              </span>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Size</p>
              <input
                type="range"
                min="0.2"
                max="2"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </label>
            <button
              type="button"
              onClick={() => setWallPhoto(null)}
              className="px-3 py-2 text-xs text-muted border border-border rounded-sm hover:text-foreground hover:border-foreground/50 transition-colors"
            >
              Use a different photo
            </button>
          </div>

          <p className="text-[11px] text-muted mt-2">
            Click anywhere on the photo to move the artwork. Use the slider to scale.
            For the most accurate preview, hold your phone level and frame the wall with
            a household object (door, skirting) in shot.
          </p>
        </>
      )}
    </div>
  );
}
