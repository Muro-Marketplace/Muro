"use client";
/**
 * A picture you can move around in: drag to pan, wheel or pinch to zoom,
 * double-click to zoom in, with +, - and reset controls. Used to "enter"
 * a saved wall picture (a venue wall, or any lightboxed image) without
 * saving anything; the view is temporary and lives only on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const PAN_ZOOM_MIN = 1;
export const PAN_ZOOM_MAX = 6;
const ZOOM_STEP = 1.5;

interface Props {
  src: string;
  alt: string;
  className?: string;
  /** Height of the viewport; defaults to 70vh, fullscreen callers pass "100vh". */
  heightClassName?: string;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

function clampScale(s: number): number {
  return Math.min(PAN_ZOOM_MAX, Math.max(PAN_ZOOM_MIN, s));
}

export default function PanZoomImage({ src, alt, className = "", heightClassName = "h-[70vh]" }: Props) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  // Pointer handlers read the committed view through a ref (kept in step
  // after each render, never written during one).
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  /** Zoom around a point given in viewport pixels relative to the box. */
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const next = clampScale(v.scale * factor);
      if (next === v.scale) return v;
      const ratio = next / v.scale;
      return { scale: next, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  }, []);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  const centre = () => {
    const el = boxRef.current;
    return el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 };
  };

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startScale: viewRef.current.scale };
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const target = clampScale((gesture.current.startScale * dist) / Math.max(1, gesture.current.startDist));
      const factor = target / viewRef.current.scale;
      if (factor !== 1) zoomAt(factor, mid.x, mid.y);
      return;
    }
    if (drag.current) {
      const d = drag.current;
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (viewRef.current.scale >= PAN_ZOOM_MAX) reset();
    else zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={boxRef}
        data-testid="pan-zoom"
        className={`${heightClassName} w-full overflow-hidden bg-stone-900 touch-none select-none ${view.scale > 1 ? "cursor-grab" : "cursor-zoom-in"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        />
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
        <button type="button" onClick={() => { const c = centre(); zoomAt(ZOOM_STEP, c.x, c.y); }} aria-label="Zoom in" className="w-11 h-11 rounded-full bg-white/90 text-stone-800 text-base font-medium shadow hover:bg-white">+</button>
        <button type="button" onClick={() => { const c = centre(); zoomAt(1 / ZOOM_STEP, c.x, c.y); }} aria-label="Zoom out" className="w-11 h-11 rounded-full bg-white/90 text-stone-800 text-base font-medium shadow hover:bg-white">−</button>
        {view.scale !== 1 && (
          <button type="button" onClick={reset} aria-label="Reset view" className="px-4 h-11 rounded-full bg-white/90 text-stone-800 text-xs font-medium shadow hover:bg-white">Reset</button>
        )}
      </div>
      <p className="absolute bottom-3 right-3 text-[11px] text-white/70 pointer-events-none">Drag to move, pinch or scroll to zoom</p>
    </div>
  );
}
