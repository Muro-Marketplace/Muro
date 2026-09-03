"use client";
/**
 * Full-size viewer for a saved wall picture: drag to move around it, pinch
 * or scroll to zoom, a Fullscreen button, Esc or the backdrop to close.
 */
import { useEffect } from "react";
import { useFullscreenBox } from "@/lib/ui/fullscreen";
import PanZoomImage from "./PanZoomImage";

interface Props {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title?: string;
  subtitle?: string;
}

export default function ImageLightbox({ open, onClose, src, alt, title, subtitle }: Props) {
  const [fullscreenRef, fullscreen] = useFullscreenBox<HTMLDivElement>();

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
          <div ref={fullscreenRef} className={`wp-fullscreen-box rounded-xl overflow-hidden bg-stone-900 shadow-2xl relative ${fullscreen.boxClassName}`}>
            {fullscreen.fake && (
              <button
                type="button"
                onClick={fullscreen.exit}
                className="absolute top-3 right-3 z-10 px-4 py-2 min-h-11 rounded-full bg-white/90 text-stone-900 text-sm font-medium shadow"
              >
                Exit fullscreen
              </button>
            )}
            <PanZoomImage src={src} alt={alt} heightClassName="h-[78vh]" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-white">
            <div className="min-w-0">
              {title && <p className="text-sm font-medium truncate">{title}</p>}
              {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fullscreen.toggle()}
                className="px-3 py-1.5 min-h-11 rounded-full bg-white/10 text-xs hover:bg-white/15"
              >
                {fullscreen.active ? "Exit fullscreen" : "Fullscreen"}
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
