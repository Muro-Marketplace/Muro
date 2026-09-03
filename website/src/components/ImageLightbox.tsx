"use client";
/**
 * Full-size viewer for a saved wall picture: the image at its full
 * resolution, a Fullscreen button, Esc or the backdrop to close.
 */
import { useEffect, useRef } from "react";
import { toggleFullscreen } from "@/lib/ui/fullscreen";

interface Props {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title?: string;
  subtitle?: string;
}

export default function ImageLightbox({ open, onClose, src, alt, title, subtitle }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? alt}
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="min-h-full grid place-items-center" onClick={onClose}>
        <div className="w-full max-w-6xl flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div ref={boxRef} className="wp-fullscreen-box rounded-xl overflow-hidden bg-stone-900 shadow-2xl grid place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="block mx-auto w-auto max-w-full h-auto max-h-[80vh]" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-white">
            <div className="min-w-0">
              {title && <p className="text-sm font-medium truncate">{title}</p>}
              {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleFullscreen(boxRef.current)}
                className="px-3 py-1.5 rounded-full bg-white/10 text-xs hover:bg-white/15"
              >
                Fullscreen
              </button>
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
