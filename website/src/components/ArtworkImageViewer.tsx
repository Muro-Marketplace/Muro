"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface Props {
  src: string;
  alt: string;
  aspectRatio: string;
}

export default function ArtworkImageViewer({ src, alt, aspectRatio }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen]);

  return (
    <>
      <div
        className="flex-1 relative bg-[#f5f5f3] rounded-sm overflow-hidden select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative w-full" style={{ aspectRatio }}>
          <Image
            src={src}
            alt={alt}
            fill
            className="object-contain p-4 pointer-events-none select-none"
            sizes="(max-width: 1024px) 100vw, 700px"
            quality={75}
            priority
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="absolute inset-0" />
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-foreground items-center justify-center shadow-lg transition-colors z-10 flex sm:hidden"
            aria-label="Expand image"
            title="Expand image"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          </button>
        </div>
      </div>

      {isFullscreen && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
            <Image
              src={src}
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
          </div>
        </div>
      )}
    </>
  );
}
