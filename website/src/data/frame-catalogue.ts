/**
 * Standard frame catalogue for the artist portfolio editor.
 *
 * Owner decision (2 September 2026): uploading a photo of the frame
 * should be one option among several, not the only one. This gives the
 * artist a set of standard frames with auto-generated preview images to
 * pick from, alongside a "Custom frame" choice for anyone whose frame
 * isn't on the list.
 *
 * `frameSwatchDataUri` turns a `StandardFrame` into a self-contained SVG
 * data URI: no external image, no AI, no network call, and the same
 * frame always produces the same string. That string becomes the
 * frame's `imageUrl`, exactly the field `artistWorkInputSchema` already
 * accepts (`optionalString(1000)`), so nothing downstream changes: the
 * artwork page preview, checkout, and the visualiser all keep reading
 * `imageUrl` as they always have.
 */

export type FrameFinish = "matte" | "gloss" | "wood" | "metal";

export interface StandardFrame {
  id: string;
  label: string;
  finish: FrameFinish;
  /** Frame moulding colour, as a 6-digit hex string. */
  colour: string;
  /** Second wood tone used for the grain stripe. Wood finishes only. */
  grain?: string;
}

export const STANDARD_FRAMES: StandardFrame[] = [
  { id: "natural-oak", label: "Natural oak", finish: "wood", colour: "#C9A66B", grain: "#9C7A45" },
  { id: "light-ash", label: "Light ash", finish: "wood", colour: "#D9CDB0", grain: "#B7A97F" },
  { id: "walnut", label: "Walnut", finish: "wood", colour: "#8A5A34", grain: "#5E3B1F" },
  { id: "dark-walnut", label: "Dark walnut", finish: "wood", colour: "#4B2E1C", grain: "#2E1B10" },
  { id: "black-box", label: "Black box", finish: "matte", colour: "#1C1C1C" },
  { id: "white-box", label: "White box", finish: "matte", colour: "#F2F1EC" },
  { id: "black-gloss", label: "Black gloss", finish: "gloss", colour: "#141414" },
  { id: "white-gloss", label: "White gloss", finish: "gloss", colour: "#FAFAFA" },
  { id: "warm-gold", label: "Warm gold", finish: "metal", colour: "#C6A24D" },
  { id: "antique-gold", label: "Antique gold", finish: "metal", colour: "#9C7C43" },
  { id: "silver", label: "Silver", finish: "metal", colour: "#B9BDC2" },
  { id: "brushed-aluminium", label: "Brushed aluminium", finish: "metal", colour: "#9AA0A6" },
  { id: "floating-black", label: "Floating black", finish: "matte", colour: "#1A1A1E" },
  { id: "floating-white", label: "Floating white", finish: "matte", colour: "#F3F2EE" },
  { id: "grey-linen", label: "Grey linen", finish: "matte", colour: "#8D897C" },
];

export function getStandardFrame(id: string): StandardFrame | undefined {
  return STANDARD_FRAMES.find((f) => f.id === id);
}

/** "Floating" frames are identified by id, there being no separate
 *  finish category for them, a floating mount is a display style that
 *  can apply on top of any finish. Keeping the fifteen entries above
 *  to one finish each keeps the dropdown's per-frame description
 *  simple, so the two floating entries key off their id instead. */
function isFloatingFrame(frame: StandardFrame): boolean {
  return frame.id.startsWith("floating-");
}

// ---- colour helpers ------------------------------------------------
// Small, dependency-free hex helpers so the bevel / highlight tones on
// the swatch derive from each frame's own `colour` rather than being
// hand-picked per entry.

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour by a 0..1 fraction. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) {
    return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  const f = 1 + amount;
  return toHex(r * f, g * f, b * f);
}

// ---- swatch rendering ------------------------------------------------

const VIEW_W = 300;
const VIEW_H = 200;

/** Wall / background tone behind the frame. Exported so tests can check
 *  it appears once (an edge-to-edge frame covers the whole card) or
 *  twice (a floating frame's visible gap shows it again) without
 *  duplicating the literal value. */
export const SWATCH_WALL_COLOUR = "#E7E3DA";
const CANVAS_COLOUR = "#F4F1EA";
const CANVAS_STROKE = "#D9D3C5";

function buildSwatchSvg(frame: StandardFrame): string {
  const floating = isFloatingFrame(frame);
  const outerInset = floating ? 16 : 0;
  const borderThickness = floating ? 12 : 26;
  const gap = floating ? 10 : 0;

  const frameX = outerInset;
  const frameY = outerInset;
  const frameW = VIEW_W - outerInset * 2;
  const frameH = VIEW_H - outerInset * 2;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">`);

  // Wall / background, drawn first so a floating frame's gap can show
  // it again later, and so the frame itself never needs to fill the
  // full card exactly.
  parts.push(`<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="${SWATCH_WALL_COLOUR}" />`);

  // Frame moulding, in the frame's own colour.
  parts.push(`<rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" fill="${frame.colour}" />`);

  // Subtle inner bevel: a lighter ring then a darker ring, suggesting a
  // moulded profile rather than a flat block of colour. The centre
  // portion is covered later by the canvas (and, for a floating frame,
  // the gap first), so only the border-band portion ends up visible.
  const bevelInset = Math.max(2, Math.round(borderThickness * 0.3));
  parts.push(
    `<rect x="${frameX + bevelInset}" y="${frameY + bevelInset}" width="${frameW - bevelInset * 2}" height="${frameH - bevelInset * 2}" fill="none" stroke="${shade(frame.colour, 0.22)}" stroke-width="1" />`,
  );
  parts.push(
    `<rect x="${frameX + bevelInset + 1.5}" y="${frameY + bevelInset + 1.5}" width="${frameW - bevelInset * 2 - 3}" height="${frameH - bevelInset * 2 - 3}" fill="none" stroke="${shade(frame.colour, -0.22)}" stroke-width="1" />`,
  );

  // Wood grain: a handful of horizontal stripes in the second tone.
  if (frame.finish === "wood" && frame.grain) {
    const stripes = 6;
    for (let i = 1; i <= stripes; i++) {
      const yy = frameY + (i * frameH) / (stripes + 1);
      parts.push(
        `<line x1="${frameX}" y1="${yy}" x2="${frameX + frameW}" y2="${yy}" stroke="${frame.grain}" stroke-width="1" opacity="0.45" />`,
      );
    }
  }

  // Gloss / metal sheen: two soft diagonal highlights.
  if (frame.finish === "gloss" || frame.finish === "metal") {
    parts.push(
      `<polygon points="${frameX},${frameY + frameH * 0.15} ${frameX + frameW * 0.35},${frameY} ${frameX + frameW * 0.55},${frameY} ${frameX + frameW * 0.2},${frameY + frameH * 0.35}" fill="#FFFFFF" opacity="0.35" />`,
    );
    parts.push(
      `<polygon points="${frameX + frameW * 0.6},${frameY + frameH} ${frameX + frameW},${frameY + frameH * 0.55} ${frameX + frameW},${frameY + frameH * 0.75} ${frameX + frameW * 0.75},${frameY + frameH}" fill="#FFFFFF" opacity="0.25" />`,
    );
  }

  let artX = frameX + borderThickness;
  let artY = frameY + borderThickness;
  let artW = frameW - borderThickness * 2;
  let artH = frameH - borderThickness * 2;

  if (floating) {
    // Gap: the wall colour shows again between the moulding and the
    // canvas. That visible strip of wall is what reads as "floating"
    // rather than a box frame sitting flush against the print.
    parts.push(`<rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" fill="${SWATCH_WALL_COLOUR}" />`);
    // Shadow: a dark, low-opacity rect offset behind the canvas.
    const shadowOffset = 4;
    parts.push(
      `<rect x="${artX + gap + shadowOffset}" y="${artY + gap + shadowOffset}" width="${artW - gap * 2}" height="${artH - gap * 2}" fill="#000000" opacity="0.18" />`,
    );
    artX += gap;
    artY += gap;
    artW -= gap * 2;
    artH -= gap * 2;
  }

  // Canvas: the neutral centre representing the mounted artwork.
  parts.push(
    `<rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" fill="${CANVAS_COLOUR}" stroke="${CANVAS_STROKE}" stroke-width="1" />`,
  );

  parts.push("</svg>");
  return parts.join("");
}

/**
 * A 3:2 SVG swatch for `frame`, as a URL-encoded data URI. Pure and
 * deterministic, same frame in, same string out, nothing external. Set
 * this as a frame's `imageUrl` and every existing reader of that field
 * keeps working unchanged.
 */
export function frameSwatchDataUri(frame: StandardFrame): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildSwatchSvg(frame))}`;
}
