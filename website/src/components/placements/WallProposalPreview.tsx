"use client";

/**
 * The picture an artist sent with a placement request: their work laid out
 * on the venue's wall (src/lib/placements/wall-proposals.ts). A thumbnail
 * with a caption in the placement card, and the full capture in a lightbox
 * on click. Used by both portals, which only differ in the caption.
 */

import { useEffect, useState } from "react";
import Image from "next/image";

export interface WallProposal {
  wallId: string;
  wallName: string;
  previewUrl: string;
}

/** The `wallProposal` field GET /api/placements attaches, or null. */
export function readWallProposal(raw: unknown): WallProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.wallId !== "string" || typeof r.previewUrl !== "string" || !r.previewUrl) return null;
  return {
    wallId: r.wallId,
    wallName: typeof r.wallName === "string" && r.wallName.trim() ? r.wallName : "Untitled wall",
    previewUrl: r.previewUrl,
  };
}

export default function WallProposalPreview({
  proposal,
  caption,
}: {
  proposal: WallProposal;
  caption: string;
}) {
  const [open, setOpen] = useState(false);

  // Esc to close and no body scroll while the capture is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-sm border border-border bg-background p-2 text-left hover:border-accent/50 transition-colors"
      >
        <span className="relative block w-24 aspect-[5/3] overflow-hidden rounded-sm bg-stone-100 shrink-0">
          <Image src={proposal.previewUrl} alt={caption} fill className="object-cover" sizes="96px" />
        </span>
        <span className="text-xs">
          <span className="block font-medium text-foreground">{caption}</span>
          <span className="block text-muted">Tap to see it full size</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm grid place-items-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl flex flex-col gap-2"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/95 shadow-sm flex items-center justify-center text-stone-600 hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            {/* The capture at full size, straight from the public bucket. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proposal.previewUrl} alt={caption} className="w-full h-auto rounded-sm shadow-2xl bg-stone-900" />
            <p className="text-xs text-white/80 text-center">{caption}</p>
          </div>
        </div>
      )}
    </>
  );
}
