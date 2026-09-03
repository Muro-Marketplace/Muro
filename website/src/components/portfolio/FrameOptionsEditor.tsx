"use client";

import Image from "next/image";
import Dropdown from "@/components/Dropdown";
import { uploadImage } from "@/lib/upload";
import { frameUpliftFor } from "@/app/(pages)/browse/[slug]/[workSlug]/frame-uplift";
import { STANDARD_FRAMES, getStandardFrame, frameSwatchDataUri } from "@/data/frame-catalogue";

/**
 * Frame options editor for the artist portfolio "Add / edit work" form.
 *
 * Owner decision (2 September 2026): uploading a photo should be one
 * choice among several, not the only one. Per frame, the artist picks
 * a standard frame (auto-generated preview, no upload needed) or
 * "Custom frame" (the original label + photo upload flow). Per-size
 * pricing renders one row per size, rather than the old cramped
 * flex-wrapped line, so a size label never gets cut off.
 *
 * State shape is unchanged from the page's own `WorkFormState`:
 * `priceUplift` and every `pricesBySize` value stay strings (the page's
 * controlled inputs need to hold "" while the artist is typing), and
 * `onChange` hands back the same shape it was given. The page still
 * owns `buildFramePayload` and the save POST; this component only
 * edits the array.
 */

export interface FrameOptionFormEntry {
  label: string;
  priceUplift: string;
  imageUrl?: string;
  pricesBySize?: Record<string, string>;
}

interface SizeLike {
  label: string;
  price: number;
}

export interface FrameOptionsEditorProps {
  frameOptions: FrameOptionFormEntry[];
  onChange: (next: FrameOptionFormEntry[]) => void;
  /** The work's current size list, used to build the per-size rows and
   *  the default-uplift placeholder for each. */
  sizes: SizeLike[];
  /** Surfaced the same way the parent form's shared error banner did
   *  before extraction, an upload failure is not a validation error on
   *  this component's own fields, so it's reported outward. */
  onUploadError?: (message: string) => void;
}

const CUSTOM_FRAME_VALUE = "custom";

const FINISH_LABEL: Record<string, string> = {
  wood: "Wood",
  matte: "Matte",
  gloss: "Gloss",
  metal: "Metal",
};

/** Reverse-lookup: which standard frame (if any) produced this imageUrl.
 *  Selection is derived from the data rather than tracked as separate
 *  UI state, so a work loaded from a saved draft shows the right
 *  dropdown choice with no extra field to keep in sync. */
function standardIdForImage(imageUrl: string | undefined): string {
  if (!imageUrl) return CUSTOM_FRAME_VALUE;
  const match = STANDARD_FRAMES.find((f) => frameSwatchDataUri(f) === imageUrl);
  return match ? match.id : CUSTOM_FRAME_VALUE;
}

export default function FrameOptionsEditor({
  frameOptions,
  onChange,
  sizes,
  onUploadError,
}: FrameOptionsEditorProps) {
  const sizesWithLabels = sizes.filter((s) => s.label.trim().length > 0);

  function updateFrame(index: number, patch: Partial<FrameOptionFormEntry>) {
    const next = [...frameOptions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function handleFrameSelect(index: number, value: string) {
    if (value === CUSTOM_FRAME_VALUE) {
      // Only clear a previously-set swatch image when leaving a
      // standard frame. Re-choosing "Custom frame" while already on
      // it must not wipe out a photo the artist already uploaded.
      const current = frameOptions[index];
      if (standardIdForImage(current.imageUrl) !== CUSTOM_FRAME_VALUE) {
        updateFrame(index, { imageUrl: undefined });
      }
      return;
    }
    const standard = getStandardFrame(value);
    if (!standard) return;
    updateFrame(index, { label: standard.label, imageUrl: frameSwatchDataUri(standard) });
  }

  async function handleImageUpload(index: number, file: File) {
    try {
      const url = await uploadImage(file, "artworks");
      updateFrame(index, { imageUrl: url });
    } catch {
      onUploadError?.("Frame image upload failed.");
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Frame options (optional)</label>
      <p className="text-xs text-muted mb-3">
        Offer framed variants. Pick a standard frame or upload a custom
        photo. The default uplift is added on top of the size price;
        below each frame, optionally set a price for a specific size,
        leave it blank to use the default.
      </p>
      <div className="space-y-4">
        {frameOptions.map((f, i) => {
          const selectedId = standardIdForImage(f.imageUrl);
          const isCustom = selectedId === CUSTOM_FRAME_VALUE;
          const defaultUplift = Number(f.priceUplift) || 0;

          return (
            <div key={i} className="space-y-2.5 border border-border/60 rounded-sm p-3">
              {/* Frame choice + remove */}
              <div className="flex items-center gap-2">
                <Dropdown
                  value={selectedId}
                  onChange={(v) => handleFrameSelect(i, v)}
                  options={[
                    ...STANDARD_FRAMES.map((sf) => ({
                      value: sf.id,
                      label: sf.label,
                      description: FINISH_LABEL[sf.finish],
                    })),
                    {
                      value: CUSTOM_FRAME_VALUE,
                      label: "Custom frame",
                      description: "Upload your own photo",
                    },
                  ]}
                  ariaLabel="Frame"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => onChange(frameOptions.filter((_, j) => j !== i))}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                  aria-label="Remove frame option"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                </button>
              </div>

              {/* Preview / upload + label */}
              <div className="flex items-center gap-2">
                {isCustom ? (
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
                    <label
                      className="absolute inset-0 border border-dashed border-border flex items-center justify-center overflow-hidden bg-surface cursor-pointer hover:border-accent/60 transition-colors"
                      title={f.imageUrl ? "Replace image" : "Add image"}
                    >
                      {f.imageUrl ? (
                        <Image src={f.imageUrl} alt={f.label || "Frame preview"} fill sizes="84px" className="object-contain" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="9" cy="9" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await handleImageUpload(i, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {f.imageUrl && (
                      <button
                        type="button"
                        onClick={() => updateFrame(i, { imageUrl: undefined })}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] hover:bg-red-500 transition-colors"
                        aria-label="Remove frame image"
                        title="Remove frame image"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative w-[72px] h-12 sm:w-[84px] sm:h-14 shrink-0 overflow-hidden bg-surface border border-border">
                    {f.imageUrl && (
                      <Image src={f.imageUrl} alt={f.label || "Frame preview"} fill sizes="84px" className="object-contain" />
                    )}
                  </div>
                )}
                <input
                  type="text"
                  value={f.label}
                  onChange={(e) => updateFrame(i, { label: e.target.value })}
                  placeholder="e.g. Black oak frame"
                  maxLength={80}
                  className="min-w-0 flex-1 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                  aria-label="Frame label"
                />
              </div>

              {/* Default uplift */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted mb-1">
                  Default uplift
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted">+£</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={f.priceUplift}
                    onChange={(e) => updateFrame(i, { priceUplift: e.target.value })}
                    placeholder="0"
                    className="w-20 bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                    aria-label="Default frame uplift"
                  />
                </div>
              </div>

              {/* Per-size overrides, one row per size, only worth
                  showing once there's more than one size to choose
                  between. */}
              {sizesWithLabels.length >= 2 && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-[10px] uppercase tracking-wider text-muted mt-2 mb-1.5">
                    Per-size price
                  </p>
                  <div className="space-y-1">
                    {sizesWithLabels.map((s) => {
                      const override = f.pricesBySize?.[s.label];
                      const defaultForSize = frameUpliftFor(
                        { priceUplift: defaultUplift },
                        s.label,
                        sizes,
                      );
                      return (
                        <div key={s.label} className="flex items-center justify-between gap-3">
                          <span className="text-xs text-foreground/80 flex-1 min-w-0 whitespace-normal break-words">
                            {s.label}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted">+£</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={override ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                const pbs = { ...(f.pricesBySize || {}) };
                                if (value === "") {
                                  delete pbs[s.label];
                                } else {
                                  pbs[s.label] = value;
                                }
                                updateFrame(i, {
                                  pricesBySize: Object.keys(pbs).length > 0 ? pbs : undefined,
                                });
                              }}
                              placeholder={String(defaultForSize)}
                              className="w-16 bg-background border border-border rounded-sm px-1.5 py-1 text-xs text-right tabular-nums focus:outline-none focus:border-accent/60"
                              aria-label={`${s.label} frame price`}
                            />
                            {override !== undefined && (
                              <button
                                type="button"
                                onClick={() => {
                                  const pbs = { ...(f.pricesBySize || {}) };
                                  delete pbs[s.label];
                                  updateFrame(i, {
                                    pricesBySize: Object.keys(pbs).length > 0 ? pbs : undefined,
                                  });
                                }}
                                className="text-[10px] text-muted hover:text-foreground underline underline-offset-2"
                              >
                                clear
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onChange([...frameOptions, { label: "", priceUplift: "" }])}
          className="text-xs text-accent hover:text-accent-hover transition-colors"
        >
          + Add frame option
        </button>
      </div>
    </div>
  );
}
