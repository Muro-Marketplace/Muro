/**
 * Frame system.
 *
 * MVP rendering strategy:
 *   Each frame style is rendered as a coloured "border" inside the item's
 *   outer bounding box, with the artwork inset by `borderRatio × min(w,h)`.
 *   This gives us a respectable look without any imagery, so the editor
 *   is fully usable before frame photo assets land in PR #5.
 *
 *   Phase 2:
 *     PR #5 will drop 9-slice frame PNGs into /public/frames/<style>/<finish>.png
 *     and the canvas will composite those instead of the solid border. The
 *     `WallItem.frame.style` and `WallItem.frame.finish` strings are
 *     forward-compatible, same data, different draw routine.
 *
 * Naming:
 *   "style" = the shape/profile of the frame.
 *   "finish" = the colour/material variation within a style.
 *   E.g. classic_wood × natural / walnut / black-stained.
 */

import type { FrameConfig, FrameStyle } from "./types";

export interface FrameFinishDef {
  id: string;
  label: string;
  /** Colour drawn for the border in the no-asset MVP look. */
  borderColor: string;
}

export interface FrameStyleDef {
  id: FrameStyle;
  label: string;
  /** Shown when nothing is selected; longer than `label`. */
  description: string;
  /** Default finish id when the style is first chosen. */
  defaultFinish: string;
  /** Available finishes for this style (≥ 1 unless style='none'). */
  finishes: FrameFinishDef[];
  /**
   * Border thickness as a ratio of the smaller of (item.width_cm, item.height_cm).
   * 0.04 = ~2cm border on a 50cm work, ~3cm on a 75cm work. Looks proportionate.
   */
  borderRatio: number;
  /** Subtle drop-shadow under framed items. Disabled for floater. */
  hasShadow: boolean;
}

export const FRAME_STYLES: readonly FrameStyleDef[] = [
  {
    id: "none",
    label: "No frame",
    description: "Edge-only, best for prints and modern photography.",
    defaultFinish: "",
    finishes: [],
    borderRatio: 0,
    hasShadow: false,
  },
  {
    id: "thin_black",
    label: "Thin black",
    description: "Slim, modern. Disappears into the work.",
    defaultFinish: "matte",
    finishes: [
      { id: "matte", label: "Matte black", borderColor: "#1A1A1A" },
      { id: "gloss", label: "Gloss black", borderColor: "#000000" },
      { id: "white", label: "White", borderColor: "#F5F1EB" },
    ],
    borderRatio: 0.025,
    hasShadow: true,
  },
  {
    id: "classic_wood",
    label: "Classic wood",
    description: "Traditional moulding, flatters paintings and prints.",
    defaultFinish: "natural",
    finishes: [
      { id: "natural", label: "Natural oak", borderColor: "#9C7A4F" },
      { id: "walnut", label: "Walnut", borderColor: "#5C3A24" },
      { id: "ebony", label: "Stained ebony", borderColor: "#1F1714" },
    ],
    borderRatio: 0.05,
    hasShadow: true,
  },
  {
    id: "ornate_gold",
    label: "Ornate gold",
    description: "Statement frame, turns a piece into a centrepiece.",
    defaultFinish: "antique",
    finishes: [
      { id: "antique", label: "Antique gold", borderColor: "#B08A3E" },
      { id: "polished", label: "Polished gold", borderColor: "#D4AF37" },
      { id: "champagne", label: "Champagne", borderColor: "#C9B481" },
    ],
    borderRatio: 0.08,
    hasShadow: true,
  },
  {
    id: "floater",
    label: "Floater",
    description: "Gallery-style float, a thin gap around the canvas edge.",
    defaultFinish: "natural",
    finishes: [
      { id: "natural", label: "Natural", borderColor: "#A1856A" },
      { id: "white", label: "White", borderColor: "#F5F1EB" },
      { id: "black", label: "Black", borderColor: "#1A1A1A" },
    ],
    borderRatio: 0.018,
    hasShadow: false, // floater visually "floats", shadow looks wrong
  },
] as const;

const STYLE_BY_ID: ReadonlyMap<FrameStyle, FrameStyleDef> = new Map(
  FRAME_STYLES.map((s) => [s.id, s]),
);

export function getFrameStyle(style: FrameStyle): FrameStyleDef {
  return STYLE_BY_ID.get(style) ?? STYLE_BY_ID.get("none")!;
}

export function getFrameFinish(
  style: FrameStyle,
  finishId: string,
): FrameFinishDef | null {
  const styleDef = getFrameStyle(style);
  return styleDef.finishes.find((f) => f.id === finishId) ?? styleDef.finishes[0] ?? null;
}

/**
 * Default config when the user picks a new style, populates a reasonable
 * starting finish so the work doesn't render with `finish: ""` mid-edit.
 */
export function defaultFrameConfig(style: FrameStyle): FrameConfig {
  const def = getFrameStyle(style);
  return {
    style,
    finish: def.defaultFinish,
    depth_mm: 0,
  };
}

// ── Geometry ────────────────────────────────────────────────────────────

export interface FrameGeometry {
  /** Where to draw the artwork image inside the outer item bounds. */
  artwork: { x: number; y: number; width: number; height: number };
  /** Border thickness in pixels. */
  borderPx: number;
  /** Resolved border colour (or null for style='none'). */
  borderColor: string | null;
  /** Whether to drop a shadow under the framed group. */
  hasShadow: boolean;
}

// ── Konva preview gradients ────────────────────────────────────────────
//
// The server-side render uses SVG-generated frames (see frame-svg.ts) for
// rich materials (wood grain, gold shimmer). Konva's editor preview
// can't directly take an SVG fill, but it does support linear gradients.
// These tables give us a "close enough" preview so the user knows what
// they're going to get when they hit Render.

export interface KonvaGradientProps {
  fill?: string;
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
}

/**
 * Per-finish Konva gradient stop arrays. `[offset, color, ...]`.
 * Diagonal direction conventions:
 *   - wood + gold: top-left → bottom-right (matches the SVG version)
 *   - black: top → bottom (subtle vertical highlight)
 *   - floater: left → right (one-tone, just a hint of depth)
 */
const KONVA_GRADIENT_STOPS: Record<FrameStyle, Record<string, Array<number | string>>> = {
  none: {},
  thin_black: {
    matte: [0, "#2A2A2A", 0.5, "#1A1A1A", 1, "#2A2A2A"],
    gloss: [0, "#1A1A1A", 0.3, "#000000", 1, "#1A1A1A"],
    white: [0, "#F5F1EB", 0.5, "#E8E2D6", 1, "#F5F1EB"],
  },
  classic_wood: {
    natural: [0, "#D9B989", 0.48, "#9C7A4F", 1, "#7C5E3A"],
    walnut: [0, "#8C5A35", 0.48, "#5C3A24", 1, "#3D2818"],
    ebony: [0, "#3A2C24", 0.48, "#1F1714", 1, "#0F0A08"],
  },
  ornate_gold: {
    antique: [0, "#5A3D08", 0.2, "#A07726", 0.5, "#D9B043", 0.78, "#A07726", 1, "#7A5510"],
    polished: [0, "#7A5505", 0.2, "#D4AF37", 0.5, "#FFEB91", 0.78, "#D4AF37", 1, "#9C6F0E"],
    champagne: [0, "#7A6A40", 0.2, "#C9B481", 0.5, "#EFE2B5", 0.78, "#C9B481", 1, "#9A8855"],
  },
  floater: {
    natural: [0, "#A1856A", 1, "#7C6347"],
    white: [0, "#F5F1EB", 1, "#E8E2D6"],
    black: [0, "#1A1A1A", 1, "#0E0E0E"],
  },
};

/**
 * Get Konva gradient props for the given frame at the given pixel size.
 * Returns `{ fill }` (solid) when no gradient is configured.
 */
export function getKonvaFrameProps(
  frame: FrameConfig,
  outerWidthPx: number,
  outerHeightPx: number,
): KonvaGradientProps {
  if (frame.style === "none") return {};

  const stops = KONVA_GRADIENT_STOPS[frame.style]?.[frame.finish];
  if (!stops) {
    // Fall back to the legacy solid colour from FRAME_STYLES.
    const finish = getFrameFinish(frame.style, frame.finish);
    return finish ? { fill: finish.borderColor } : {};
  }

  // Direction: black is vertical, everything else diagonal-or-horizontal.
  if (frame.style === "thin_black") {
    return {
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: outerHeightPx },
      fillLinearGradientColorStops: stops,
    };
  }
  if (frame.style === "floater") {
    return {
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: outerWidthPx, y: 0 },
      fillLinearGradientColorStops: stops,
    };
  }
  // wood + gold: diagonal
  return {
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: outerWidthPx, y: outerHeightPx },
    fillLinearGradientColorStops: stops,
  };
}

/**
 * Compute the inner artwork rectangle (in pixel coords inside the item)
 * for the given outer pixel size and frame config.
 */
export function computeFrameGeometry(
  outerWidthPx: number,
  outerHeightPx: number,
  frame: FrameConfig,
): FrameGeometry {
  const styleDef = getFrameStyle(frame.style);
  const finishDef = getFrameFinish(frame.style, frame.finish);
  // Don't let the border eat the artwork on small items, cap so the
  // artwork stays at least 30% of the outer dimension.
  const minOuter = Math.min(outerWidthPx, outerHeightPx);
  const maxBorder = minOuter * 0.35;
  const borderPx = Math.min(maxBorder, styleDef.borderRatio * minOuter);

  return {
    artwork: {
      x: borderPx,
      y: borderPx,
      width: Math.max(1, outerWidthPx - borderPx * 2),
      height: Math.max(1, outerHeightPx - borderPx * 2),
    },
    borderPx,
    borderColor: finishDef?.borderColor ?? null,
    hasShadow: styleDef.hasShadow,
  };
}
