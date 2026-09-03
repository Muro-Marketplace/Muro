"use client";

/**
 * RenderPreview, fullscreen modal that shows the preview the editor just
 * captured, with quick actions (Save to wall / Download / Open in new tab
 * / Close).
 *
 * The image is a blob object URL of a pixel capture of the editor stage,
 * so it is exactly what the editor showed. A plain <img> is used because
 * next/image cannot serve a blob URL. The parent owns the open/closed
 * state (so it can also close it when the user starts a new edit).
 *
 * `saveToWall` is the saved-wall affordance (venue My Walls editor and
 * the artist modes): it stores this capture against the wall's layout so
 * the wall list and the public venue profile show the wall as built.
 *
 * `saveToArtwork` is the artist-specific "promote this preview to a
 * mockup on one of my artworks" affordance. When provided, we render a
 * picker showing the artist's works + a save button. Hidden in
 * customer/venue contexts.
 *
 * `proposal` is the artist-on-a-venue-wall affordance (`artist_venue_wall`):
 * the primary action becomes "Send to {venue}", which opens a compact
 * placement request inside this modal (ProposalSendPanel).
 */

import { useEffect, useState } from "react";
import ProposalSendPanel, { type ProposalSendPanelProps } from "./ProposalSendPanel";

export type SaveToWallStatus = "idle" | "saving" | "saved" | "error";

export interface SaveToWallProps {
  /** Starts the save; the parent tracks progress through `status`. */
  onSave: () => void;
  status: SaveToWallStatus;
  error: string | null;
  /** Button copy while idle, e.g. "Save this preview to my wall". */
  label: string;
  /** Button copy once saved. Defaults to "Saved". */
  savedLabel?: string;
  /** One line under the button explaining where the preview will show. */
  hint?: string;
}

export interface SaveToArtworkProps {
  /** Works the artist can attach this mockup to. */
  works: Array<{ id: string; title: string; image: string }>;
  /** When the editor was opened against a specific work, pre-select it. */
  preferredWorkId?: string | null;
  /** Returns when the save is fully complete or has errored. */
  onSave: (workId: string) => Promise<void>;
  /** UI state, owned by the parent so it can persist between opens. */
  saving: boolean;
  savedWorkId: string | null;
  error: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Object URL of the captured image. */
  imageUrl: string | null;
  /** File name offered by the Download link. */
  downloadName?: string;
  saveToWall?: SaveToWallProps;
  saveToArtwork?: SaveToArtworkProps;
  /** The Send step for an artist proposing on a venue's wall. */
  proposal?: ProposalSendPanelProps;
  /** When true, hide the Download CTA + apply anti-save attributes
      to the image (right-click block, drag prevention,
      pointer-events:none). Used in the venue context where the
      composite is the artist's IP, venues shouldn't be able to
      one-click save it off the platform. Determined users can
      still screenshot, this just removes the casual save paths. */
  venueViewer?: boolean;
}

export default function RenderPreview({
  open,
  onClose,
  imageUrl,
  downloadName = "wall-preview.webp",
  saveToWall,
  saveToArtwork,
  proposal,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickedWorkId(initial);
  }, [saveToArtwork, open]);

  if (!open || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wall preview"
      // Scrolls when the column is taller than the viewport, and the image is
      // capped at a fraction of it, so the strip under the picture (Save to
      // wall, Send to the venue) is always reachable. It used to sit below
      // the fold on shorter screens with no way to scroll to it.
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="min-h-full grid place-items-center"
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
            None of this stops a screenshot, this is a friction
            layer, not DRM. */}
        <div
          className="rounded-xl overflow-hidden bg-stone-900 shadow-2xl relative select-none"
          onContextMenu={venueViewer ? (e) => e.preventDefault() : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Wall preview"
            className={`block mx-auto w-auto max-w-full h-auto max-h-[62vh] ${venueViewer ? "pointer-events-none select-none" : ""}`}
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
         * Save-to-wall strip. Rendered for saved walls (venue editor and
         * artist modes). Primary action: the preview becomes the wall's
         * picture on the wall list and, for venues who have published the
         * wall, on their public profile.
         */}
        {saveToWall && (
          <div className="rounded-xl bg-white/95 text-stone-900 px-4 py-3 shadow-lg flex flex-wrap items-center gap-3">
            <div className="text-xs flex-1 min-w-[10rem]">
              <p className="font-medium text-stone-900">
                {saveToWall.status === "saved"
                  ? "This preview is now saved to your wall."
                  : "Happy with it? Save this preview to your wall."}
              </p>
              {saveToWall.hint && (
                <p className="text-stone-500 leading-snug">{saveToWall.hint}</p>
              )}
            </div>
            <button
              type="button"
              disabled={saveToWall.status === "saving" || saveToWall.status === "saved"}
              onClick={saveToWall.onSave}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {saveToWall.status === "saving"
                ? "Saving…"
                : saveToWall.status === "saved"
                  ? (saveToWall.savedLabel ?? "Saved")
                  : saveToWall.status === "error"
                    ? "Try again"
                    : saveToWall.label}
            </button>
            {saveToWall.status === "error" && saveToWall.error && (
              <p className="basis-full text-xs text-red-600">{saveToWall.error}</p>
            )}
          </div>
        )}

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
              aria-label="Artwork to attach this mockup to"
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
                  ? "Saved"
                  : "Save to artwork"}
            </button>
            {saveToArtwork.error && (
              <p className="basis-full text-xs text-red-600">
                {saveToArtwork.error}
              </p>
            )}
          </div>
        )}

        {/*
         * Send-to-venue step. Only for an artist laying out on a venue's
         * public wall: the capture goes to the venue with a placement
         * request, nothing is saved to the artist's own walls.
         */}
        {proposal && <ProposalSendPanel {...proposal} />}

        {/* Footer bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-white">
          <p className="text-xs text-white/70">
            Exactly as laid out in the editor.
          </p>
          <div className="flex items-center gap-2">
            {/* Open-in-new-tab + Download are hidden for venues,
                they shouldn't be one-clicking the artist's render
                off the platform. Artists keep these for sharing
                + mockup workflows. */}
            {!venueViewer && (
              <>
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-full bg-white/10 text-xs hover:bg-white/15"
                >
                  Open in new tab
                </a>
                <a
                  href={imageUrl}
                  download={downloadName}
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
    </div>
  );
}
