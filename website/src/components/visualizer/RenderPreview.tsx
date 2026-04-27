"use client";

/**
 * RenderPreview — fullscreen modal that shows the freshly-rendered webp,
 * with quick actions (Download / Open in new tab / Close).
 *
 * Shown after a successful POST /render. Holds the publicUrl + meta from
 * the response. The parent owns the open/closed state (so it can also
 * close it when the user starts a new edit).
 *
 * `cached` flag in the footer lets us be honest about whether quota was
 * used — important transparency point per the brief.
 *
 * `saveToArtwork` is the artist-specific "promote this render to a
 * mockup on one of my artworks" affordance. When provided, we render a
 * picker showing the artist's works + a save button. Hidden in
 * customer/venue contexts.
 */

import { useEffect, useState } from "react";

export interface SaveToArtworkProps {
  /** Works the artist can attach this mockup to. */
  works: Array<{ id: string; title: string; image: string }>;
  /** When the editor was opened against a specific work, pre-select it. */
  preferredWorkId?: string | null;
  /** Returns when the save is fully complete or has errored. */
  onSave: (workId: string) => Promise<void>;
  /** UI state — owned by the parent so it can persist between opens. */
  saving: boolean;
  savedWorkId: string | null;
  error: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  publicUrl: string | null;
  cached: boolean;
  costUnits: number;
  meta?: {
    width: number;
    height: number;
    itemCount: number;
    skippedItems: number;
    durationMs: number;
  };
  saveToArtwork?: SaveToArtworkProps;
  /** When true, hide the Download CTA + apply anti-save attributes
      to the rendered image (right-click block, drag prevention,
      pointer-events:none). Used in the venue context where the
      composite is the artist's IP — venues shouldn't be able to
      one-click save it off the platform. Determined users can
      still screenshot, this just removes the casual save paths. */
  venueViewer?: boolean;
}

export default function RenderPreview({
  open,
  onClose,
  publicUrl,
  cached,
  costUnits,
  meta,
  saveToArtwork,
  venueViewer,
}: Props) {
  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Picker state (local so it resets per-open without bloating the
  // parent). Pre-fills with the preferred work id when the editor is
  // opened against a specific artwork.
  const [pickedWorkId, setPickedWorkId] = useState<string>("");
  useEffect(() => {
    if (!saveToArtwork) return;
    const initial =
      saveToArtwork.preferredWorkId ??
      saveToArtwork.works[0]?.id ??
      "";
    setPickedWorkId(initial);
  }, [saveToArtwork, open]);

  if (!open || !publicUrl) return null;

  const sublabel = cached
    ? "Loaded from cache (no quota used)"
    : `Used ${costUnits} render unit${costUnits === 1 ? "" : "s"}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Render preview"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image. When venueViewer=true we wire up casual-save
            blockers: right-click is consumed, the image is
            pointer-events:none + draggable=false so neither the
            context menu nor drag-to-desktop succeed, and we add a
            second transparent overlay so even "save image as" via
            keyboard shortcut hits an opaque-looking element first.
            None of this stops a screenshot — this is a friction
            layer, not DRM. */}
        <div
          className="rounded-xl overflow-hidden bg-stone-900 shadow-2xl relative select-none"
          onContextMenu={venueViewer ? (e) => e.preventDefault() : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl}
            alt="Wall visualisation"
            className={`w-full h-auto block ${venueViewer ? "pointer-events-none select-none" : ""}`}
            draggable={venueViewer ? false : undefined}
            onContextMenu={venueViewer ? (e) => e.preventDefault() : undefined}
          />
          {venueViewer && (
            <div
              className="absolute inset-0 pointer-events-auto"
              onContextMenu={(e) => e.preventDefault()}
              aria-hidden
            />
          )}
        </div>

        {/*
         * Save-to-artwork strip. Only renders for the artist modes
         * (parent passes saveToArtwork). Picker lists the artist's own
         * works; pre-selects the preferred one (set when the visualizer
         * was launched from a specific artwork).
         */}
        {saveToArtwork && saveToArtwork.works.length > 0 && (
          <div className="rounded-xl bg-white/95 text-stone-900 px-4 py-3 shadow-lg flex flex-wrap items-center gap-3">
            <div className="text-xs flex-1 min-w-[10rem]">
              <p className="font-medium text-stone-900">
                Save as a buyer-facing mockup
              </p>
              <p className="text-stone-500 leading-snug">
                Attaches this scene to the artwork&apos;s listing as an
                additional image.
              </p>
            </div>
            <select
              value={pickedWorkId}
              onChange={(e) => setPickedWorkId(e.target.value)}
              disabled={saveToArtwork.saving}
              className="text-xs px-3 py-1.5 rounded-md border border-stone-300 bg-white max-w-[14rem] truncate"
            >
              {saveToArtwork.works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={
                saveToArtwork.saving ||
                !pickedWorkId ||
                saveToArtwork.savedWorkId === pickedWorkId
              }
              onClick={() => {
                if (pickedWorkId) saveToArtwork.onSave(pickedWorkId);
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {saveToArtwork.saving
                ? "Saving…"
                : saveToArtwork.savedWorkId === pickedWorkId
                  ? "Saved ✓"
                  : "Save to artwork"}
            </button>
            {saveToArtwork.error && (
              <p className="basis-full text-xs text-red-600">
                {saveToArtwork.error}
              </p>
            )}
          </div>
        )}

        {/* Footer bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-white">
          <div className="text-xs">
            <p className="font-medium">{sublabel}</p>
            {meta && (
              <p className="text-white/60">
                {meta.itemCount} item{meta.itemCount === 1 ? "" : "s"}
                {meta.skippedItems > 0 && ` · ${meta.skippedItems} skipped`} ·{" "}
                {Math.round(meta.durationMs / 100) / 10}s
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Open-in-new-tab + Download are hidden for venues —
                they shouldn't be one-clicking the artist's render
                off the platform. Artists keep these for sharing
                + mockup workflows. */}
            {!venueViewer && (
              <>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-full bg-white/10 text-xs hover:bg-white/15"
                >
                  Open in new tab
                </a>
                <a
                  href={publicUrl}
                  download
                  className="px-3 py-1.5 rounded-full bg-white/10 text-xs hover:bg-white/15"
                >
                  Download
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-full bg-white text-stone-900 text-xs font-medium hover:bg-stone-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
