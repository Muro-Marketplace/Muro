"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface Props {
  src: string;
  alt: string;
  aspectRatio: string;
  images?: string[];
}

export default function ArtworkImageViewer({ src, alt, aspectRatio, images }: Props) {
  const all = (() => {
    const list = [src, ...(images ?? [])].filter(Boolean);
    return Array.from(new Set(list));
  })();
  const [activeIdx, setActiveIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeSrc = all[activeIdx] ?? src;
  const hasMultiple = all.length > 1;

  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "ArrowRight" && hasMultiple) setActiveIdx((i) => (i + 1) % all.length);
      if (e.key === "ArrowLeft" && hasMultiple) setActiveIdx((i) => (i - 1 + all.length) % all.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen, hasMultiple, all.length]);

  return (
    <>
      <div className="flex-1 flex flex-col gap-3">
        <div
          className="relative bg-[#f5f5f3] rounded-sm overflow-hidden select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Container shape stays driven by the work's aspect ratio,
              but the height is capped at ~80vh so a tall portrait
              never blows past the viewport on a 13" laptop. The image
              uses object-contain so it letter-boxes inside the cap
              rather than getting cropped. */}
          <div
            className="relative w-full mx-auto max-h-[calc(100vh-12rem)]"
            style={{ aspectRatio }}
          >
            <Image
              key={activeSrc}
              src={activeSrc}
              alt={alt}
              fill
              className="object-contain p-4 sm:p-6 lg:p-8 pointer-events-none select-none transition-opacity duration-300"
              sizes="(max-width: 1024px) 100vw, 700px"
              quality={80}
              priority
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="absolute inset-0" />
            <button
              onClick={() => setIsFullscreen(true)}
              className="lg:hidden absolute top-3 right-3 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-foreground items-center justify-center shadow-md transition-colors z-10 flex"
              aria-label="Expand image"
              title="Expand image"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
            </button>

          </div>
        </div>
        {/* View on your wall — sits directly under the image, aligned
            to the bottom-left, so it reads as an action on this piece
            without sitting on top of the artwork. Uses a custom event
            so the modal state can live in ArtworkPageClient without
            prop-drilling through the page. */}
        <div className="flex">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("wallplace:open-wall-viz"))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface hover:bg-[#F5F3F0] border border-border text-foreground text-xs font-medium transition-colors"
            aria-label="View on your wall"
            title="View on your wall"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            View on your wall
          </button>
        </div>

        {hasMultiple && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {all.map((img, idx) => (
              <button
                key={img + idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                aria-label={`View image ${idx + 1}`}
                aria-current={idx === activeIdx}
                className={`relative shrink-0 w-16 sm:w-20 aspect-square rounded-sm overflow-hidden bg-[#f5f5f3] transition-all ${
                  idx === activeIdx
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={img}
                  alt={`${alt} — view ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                  quality={45}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {isFullscreen && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
            <Image
              src={activeSrc}
              alt={alt}
              fill
              className="object-contain select-none"
              sizes="100vw"
              quality={85}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shadow-lg transition-colors z-10"
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4" /><path d="M15 3h4a2 2 0 0 1 2 2v4" /><path d="M15 21h4a2 2 0 0 0 2-2v-4" /><path d="M9 21H5a2 2 0 0 1-2-2v-4" /></svg>
            </button>
            {hasMultiple && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveIdx((i) => (i - 1 + all.length) % all.length); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shadow-lg transition-colors z-10"
                  aria-label="Previous image"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveIdx((i) => (i + 1) % all.length); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shadow-lg transition-colors z-10"
                  aria-label="Next image"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-xs tracking-wider">
                  {activeIdx + 1} / {all.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
