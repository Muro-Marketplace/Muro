"use client";

/**
 * CustomerWallSheet, modal wrapper for the customer "View on a wall"
 * flow on the artwork detail page.
 *
 * Hosts WallVisualizer in `customer_artwork_page` mode with the
 * artwork pre-locked. Customers can:
 *   - Switch wall preset / colour / dimensions
 *   - Switch frame style + finish
 *   - Cycle through listed artwork sizes (when the work has variants)
 *   - Drag/resize the artwork on the wall
 *   - Hit Render to get a polished composite (auth + quota required)
 *
 * Design choices:
 *   - Fullscreen on mobile, tall modal (90vh) on desktop. Konva needs
 *     room to breathe, squeezing it into a small dialog defeats the
 *     point of the feature.
 *   - Locks scroll on the body while open so the page underneath can't
 *     scroll behind the sheet.
 *   - Esc + outside-click both close.
 *
 * Feature flag:
 *   The caller (ArtworkPageClient) is responsible for checking
 *   WALL_VISUALIZER_V1 and only mounting this when the flag is on.
 *   This component assumes it's reachable.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import type { PanelWork } from "./WorksPanel";

// Konva touches `window` at module init, must dynamic-import.
const WallVisualizer = dynamic(
  () => import("./WallVisualizer"),
  { ssr: false },
);

interface Props {
  open: boolean;
  onClose: () => void;
  /** Artwork to lock onto the wall. Pre-spawned at natural size. */
  work: PanelWork;
}

export default function CustomerWallSheet({ open, onClose, work }: Props) {
  const { session } = useAuth();

  // Esc to close + body-scroll lock.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View ${work.title} on a wall`}
      // pt-14/lg:pt-20 keeps the modal header clear of the global
      // nav bar (which is sticky at h-14 lg:h-16). Without this the
      // sheet's "View on a wall" title gets clipped by the nav.
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-stretch sm:items-start justify-center pt-14 sm:pt-20 sm:px-6 sm:pb-6"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-6xl bg-stone-50 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-[calc(100vh-100px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b border-border bg-white">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
              View on a wall
            </p>
            <p className="text-sm font-medium text-foreground truncate">
              {work.title}
              {work.artistName && (
                <span className="text-muted"> · {work.artistName}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1.5 -mr-1 text-stone-500 hover:text-stone-900 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Visualizer body */}
        <div className="flex-1 min-h-0">
          <WallVisualizer
            mode="customer_artwork_page"
            lockedWork={work}
            authToken={session?.access_token ?? null}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
