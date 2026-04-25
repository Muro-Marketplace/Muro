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
 */

import { useEffect } from "react";

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
}

export default function RenderPreview({
  open,
  onClose,
  publicUrl,
  cached,
  costUnits,
  meta,
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
        {/* Image */}
        <div className="rounded-xl overflow-hidden bg-stone-900 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl}
            alt="Wall visualisation"
            className="w-full h-auto block"
          />
        </div>

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
