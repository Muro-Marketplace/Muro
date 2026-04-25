"use client";

/**
 * ItemToolbar — floating toolbar for the currently selected item.
 *
 * Rendered as an HTML overlay (not Konva) so we get crisp text + native
 * focus management. Anchored to the top-centre of the canvas region to
 * keep simple positioning logic; later we can pin it next to the item
 * itself once the editor has multi-row layouts.
 *
 * Capabilities:
 *   - Pick a size from the dropdown (when the work has size variants)
 *   - Pick frame style (5 options)
 *   - Pick frame finish (filtered to current style's finishes)
 *   - Bring forward / send back
 *   - Duplicate / delete
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SizeVariant,
  WorkOrientation,
} from "@/lib/visualizer/dimensions";
import {
  FRAME_STYLES,
  defaultFrameConfig,
  getFrameStyle,
} from "@/lib/visualizer/frames";
import type { FrameStyle, WallItem } from "@/lib/visualizer/types";

interface Props {
  item: WallItem;
  onChange: (partial: Partial<WallItem>) => void;
  onBringForward: () => void;
  onSendBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Available size variants for the work this item references. */
  sizes?: SizeVariant[];
  /** Work's intended orientation — when a chosen size variant disagrees
   *  (e.g. label parses as portrait but the work is a landscape image)
   *  we swap width/height before committing. Same logic as
   *  `pickDefaultSize` for initial drops. */
  orientation?: WorkOrientation;
}

export default function ItemToolbar({
  item,
  onChange,
  onBringForward,
  onSendBack,
  onDuplicate,
  onDelete,
  sizes,
  orientation,
}: Props) {
  const styleDef = useMemo(() => getFrameStyle(item.frame.style), [item.frame.style]);

  const handleStyleChange = (newStyle: FrameStyle) => {
    onChange({ frame: defaultFrameConfig(newStyle) });
  };

  const handleFinishChange = (finishId: string) => {
    onChange({ frame: { ...item.frame, finish: finishId } });
  };

  return (
    <div
      role="toolbar"
      aria-label="Selected artwork"
      className="flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/95 backdrop-blur border border-black/10 shadow-md text-stone-700"
    >
      {/* Size dropdown — only when the work has multiple listed sizes */}
      {sizes && sizes.length > 1 && (
        <>
          <SizeDropdown
            sizes={sizes}
            currentLabel={item.size_label ?? null}
            currentWidthCm={item.width_cm}
            currentHeightCm={item.height_cm}
            onPick={(v) => {
              // Same orientation-swap logic as pickDefaultSize. The
              // listed pricing label may be a rotated form of the
              // actual print (e.g. '20×28" (50×70cm)' parses as 50×70
              // portrait but the artwork is landscape). Swap so the
              // image isn't squashed into the wrong-aspect box.
              let widthCm = v.widthCm;
              let heightCm = v.heightCm;
              if (orientation && orientation !== "square") {
                const isPortrait = heightCm > widthCm;
                const wantsPortrait = orientation === "portrait";
                if (isPortrait !== wantsPortrait) {
                  [widthCm, heightCm] = [heightCm, widthCm];
                }
              }
              onChange({
                width_cm: widthCm,
                height_cm: heightCm,
                size_label: v.label,
              });
            }}
          />
          <span className="h-4 w-px bg-black/10" />
        </>
      )}

      {/* Frame style — segmented buttons */}
      <div className="flex items-center gap-0.5">
        {FRAME_STYLES.map((s) => {
          const active = s.id === item.frame.style;
          return (
            <button
              key={s.id}
              type="button"
              title={s.label}
              onClick={() => handleStyleChange(s.id)}
              className={`px-2 py-1 text-[11px] rounded-full transition ${
                active
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Finish — only when style has finishes */}
      {styleDef.finishes.length > 0 && (
        <>
          <span className="h-4 w-px bg-black/10" />
          <select
            aria-label="Frame finish"
            value={item.frame.finish}
            onChange={(e) => handleFinishChange(e.target.value)}
            className="text-[11px] px-1.5 py-0.5 rounded border border-black/10 bg-white"
          >
            {styleDef.finishes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </>
      )}

      <span className="h-4 w-px bg-black/10" />

      {/* Z-order */}
      <button
        type="button"
        title="Bring forward"
        onClick={onBringForward}
        className="px-2 py-1 text-[11px] rounded hover:bg-stone-100"
      >
        ↑
      </button>
      <button
        type="button"
        title="Send back"
        onClick={onSendBack}
        className="px-2 py-1 text-[11px] rounded hover:bg-stone-100"
      >
        ↓
      </button>

      <span className="h-4 w-px bg-black/10" />

      {/* Duplicate / delete */}
      <button
        type="button"
        title="Duplicate"
        onClick={onDuplicate}
        className="px-2 py-1 text-[11px] rounded hover:bg-stone-100"
      >
        Duplicate
      </button>
      <button
        type="button"
        title="Delete"
        onClick={onDelete}
        className="px-2 py-1 text-[11px] rounded text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}

// ── Size dropdown ───────────────────────────────────────────────────────

interface SizeDropdownProps {
  sizes: SizeVariant[];
  currentLabel: string | null;
  currentWidthCm: number;
  currentHeightCm: number;
  onPick: (v: SizeVariant) => void;
}

/**
 * Click-to-open size menu. Sorts variants by area so the order is
 * monotonic (smallest → largest), which feels right for "step up a
 * size" mental model.
 *
 * We render a custom dropdown rather than a native <select> because:
 *   - Native selects can't show secondary metadata (cm hint + price).
 *   - Their styling differs across browsers and clashes with the
 *     toolbar pill aesthetic.
 *   - We need the trigger to display a compact label while the menu
 *     shows the full label.
 */
function SizeDropdown({
  sizes,
  currentLabel,
  currentWidthCm,
  currentHeightCm,
  onPick,
}: SizeDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () =>
      [...sizes].sort(
        (a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm,
      ),
    [sizes],
  );

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Trigger label: drop the parenthesised hint entirely (we surface the
  // metric size + price separately in the menu). For "12×16\" (A3)"
  // we just show "12×16\"". Cleaner than the old "show what's in the
  // brackets" approach.
  const triggerLabel = useMemo(() => {
    if (currentLabel) {
      const stripped = stripBrackets(currentLabel);
      return stripped.length > 14
        ? stripped.slice(0, 12) + "…"
        : stripped;
    }
    return `${Math.round(currentWidthCm)}×${Math.round(currentHeightCm)} cm`;
  }, [currentLabel, currentWidthCm, currentHeightCm]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        title="Pick a listed size"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-stone-100"
      >
        <span className="tabular-nums">{triggerLabel}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-60"
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Available sizes"
          className="absolute z-10 mt-1 left-0 min-w-[200px] rounded-lg bg-white border border-black/10 shadow-lg overflow-hidden"
        >
          {sorted.map((v) => {
            const active = currentLabel === v.label;
            return (
              <li key={v.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onPick(v);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between gap-3 transition ${
                    active
                      ? "bg-stone-900 text-white"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <span className="font-medium truncate">{stripBrackets(v.label)}</span>
                  <span
                    className={`tabular-nums shrink-0 text-[10px] ${
                      active ? "text-white/70" : "text-stone-400"
                    }`}
                  >
                    {Math.round(v.widthCm)}×{Math.round(v.heightCm)} cm
                    {typeof v.priceGbp === "number" &&
                      ` · £${v.priceGbp}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Drop the parenthesised hint from a size label and trim any leftover
 * whitespace. '12×16" (A3)' → '12×16"'. Pure display formatting —
 * persistence still uses the original label so we can match against
 * pricing variants reliably.
 */
function stripBrackets(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}
