/**
 * Dimension parser.
 *
 * Artist work data comes in as free-text strings ("70 x 50 cm",
 * "8×10\" (A4)", "A3", "12 inch", "50×70cm"). The visualizer needs
 * structured cm dimensions to place items at true scale on a wall.
 *
 * This module:
 *   1. Parses a free-text label to {widthCm, heightCm} or null.
 *   2. Resolves all the size variants on a work (the `pricing[]` array)
 *      so the editor can cycle through them.
 *   3. Picks a sensible "natural" default when the user just drags a
 *      work onto the wall.
 *
 * Recognised forms (case-insensitive, whitespace-tolerant):
 *   - "{w}x{h}cm"        e.g. 50x70cm, 50 × 70 cm
 *   - "{w}x{h}mm"
 *   - "{w}x{h}m"
 *   - "{w}x{h} inch[es]" e.g. 8x10 inch, 8x10"
 *   - "8x10\""           inches via trailing quote
 *   - "{w}\"x{h}\""      mixed
 *   - "Aₙ"               paper sizes A0..A6 (B-series + Letter/Legal too)
 *   - Anything in parens, preferred when the outer reading is in
 *     inches (e.g. "8×10\" (A4)" → A4 reading wins because it's more
 *     precise than the rounded inch label).
 *
 * If we can't make sense of the string we return null. Callers fall
 * back to their default size (e.g. WallVisualizer.DEFAULT_ITEM_*).
 */

// ── Standard paper sizes (cm) ───────────────────────────────────────────

const PAPER_SIZES_CM: Record<string, { widthCm: number; heightCm: number }> = {
  A0: { widthCm: 84.1, heightCm: 118.9 },
  A1: { widthCm: 59.4, heightCm: 84.1 },
  A2: { widthCm: 42, heightCm: 59.4 },
  A3: { widthCm: 29.7, heightCm: 42 },
  A4: { widthCm: 21, heightCm: 29.7 },
  A5: { widthCm: 14.8, heightCm: 21 },
  A6: { widthCm: 10.5, heightCm: 14.8 },
  B0: { widthCm: 100, heightCm: 141.4 },
  B1: { widthCm: 70.7, heightCm: 100 },
  B2: { widthCm: 50, heightCm: 70.7 },
  B3: { widthCm: 35.3, heightCm: 50 },
  B4: { widthCm: 25, heightCm: 35.3 },
  LETTER: { widthCm: 21.59, heightCm: 27.94 },
  LEGAL: { widthCm: 21.59, heightCm: 35.56 },
  TABLOID: { widthCm: 27.94, heightCm: 43.18 },
};

// ── Public types ────────────────────────────────────────────────────────

export interface ParsedDimensions {
  widthCm: number;
  heightCm: number;
}

export interface SizeVariant {
  /** Human-readable label as listed on the work (e.g. "12×16\" (A3)"). */
  label: string;
  widthCm: number;
  heightCm: number;
  /** Optional price (carries through from the original SizePricing). */
  priceGbp?: number;
}

// ── Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a free-text dimension string into cm. Returns null on
 * unparseable input.
 *
 * Strategy:
 *   1. Try the entire string as a recognised paper size.
 *   2. Try to extract the parenthesised hint first ("8×10\" (A4)" → A4)
 *      because it's usually the precise reading.
 *   3. Otherwise extract the first numeric pair and resolve its unit.
 */
export function parseDimensions(input: string | null | undefined): ParsedDimensions | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1. Whole-string paper size?
  const paper = matchPaperSize(raw);
  if (paper) return paper;

  // 2. Parenthesised hint? Prefer it if it parses.
  const parenMatch = /\(([^)]+)\)/.exec(raw);
  if (parenMatch) {
    const inner = matchPaperSize(parenMatch[1]) ?? matchNumericPair(parenMatch[1]);
    if (inner) return inner;
  }

  // 3. Strip parens and try the outer.
  const outer = raw.replace(/\([^)]*\)/g, " ").trim();
  return matchPaperSize(outer) ?? matchNumericPair(outer);
}

/**
 * Look up a string against the paper-size table. Tolerates "A4", "a 4",
 * "A 4", "A-4". Returns null on no match.
 */
function matchPaperSize(s: string): ParsedDimensions | null {
  const cleaned = s.trim().toUpperCase().replace(/[\s\-_]/g, "");
  if (PAPER_SIZES_CM[cleaned]) return PAPER_SIZES_CM[cleaned];
  return null;
}

/**
 * Extract the first numeric pair and a trailing unit. Handles:
 *   "70 x 50 cm" / "70×50cm" / "8x10\"" / "12 inch by 16 inch"
 *
 * We capture both numbers regardless of separator, then look at the
 * whole string for the unit token (cm / mm / m / inch / ").
 */
function matchNumericPair(s: string): ParsedDimensions | null {
  // Detect the unit on the original string (before we strip words).
  const unit = detectUnit(s);
  // Strip unit words BEFORE running the number regex so we accept
  // "16 inches by 24 inches" (the unit word interrupts the separator).
  const stripped = s.replace(
    /\b(?:cm|mm|inch(?:es)?|in|m)\b/gi,
    " ",
  );
  // Two non-negative decimals separated by x | × | * | by
  const pairRe = /(\d+(?:\.\d+)?)\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)/i;
  const m = pairRe.exec(stripped);
  if (!m) return null;

  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }

  return convertToCm(w, h, unit);
}

type Unit = "cm" | "mm" | "m" | "in";

function detectUnit(s: string): Unit {
  const lower = s.toLowerCase();
  if (/\b(?:in|inch|inches)\b/.test(lower) || /["″]/.test(s)) return "in";
  if (/\bmm\b/.test(lower)) return "mm";
  // " m " (with word boundary spaces) means metres; "cm" already excluded
  if (/\bcm\b/.test(lower)) return "cm";
  if (/(?:^|[^a-z])m(?:[^a-z]|$)/i.test(lower)) return "m";
  // No explicit unit: small numbers (<25) are likely inches, otherwise cm.
  // Single-digit "8x10" without unit reads more naturally as inches than
  // "8 cm × 10 cm", that'd be a postage stamp.
  return null as unknown as Unit; // signal "guess from magnitude" below
}

function convertToCm(w: number, h: number, unit: Unit | null): ParsedDimensions {
  // Magnitude-based unit guess when caller couldn't detect one.
  let resolved = unit;
  if (resolved === null) {
    const m = Math.max(w, h);
    if (m < 30) resolved = "in"; // 8×10 etc.
    else if (m > 1000) resolved = "mm"; // 500×700 mm
    else resolved = "cm";
  }

  switch (resolved) {
    case "cm":
      return { widthCm: w, heightCm: h };
    case "mm":
      return { widthCm: w / 10, heightCm: h / 10 };
    case "m":
      return { widthCm: w * 100, heightCm: h * 100 };
    case "in":
      return { widthCm: w * 2.54, heightCm: h * 2.54 };
  }
}

// ── Sizes from a work ───────────────────────────────────────────────────

export interface SizeInputRow {
  label: string;
  price?: number;
}

/**
 * Build size variants from a work's pricing array. Filters out rows
 * we can't parse, and de-duplicates by (widthCm, heightCm) so two
 * identical-size rows with different labels don't both show up.
 *
 * Order is preserved (first-seen wins on dupes) so artists' intent
 * (smallest → largest is the convention) carries through.
 */
export function buildSizeVariants(
  pricing: SizeInputRow[] | null | undefined,
): SizeVariant[] {
  if (!pricing || !Array.isArray(pricing)) return [];
  const out: SizeVariant[] = [];
  const seen = new Set<string>();
  for (const row of pricing) {
    if (!row || typeof row.label !== "string") continue;
    const dims = parseDimensions(row.label);
    if (!dims) continue;
    const key = `${dims.widthCm.toFixed(2)}x${dims.heightCm.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: row.label,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      priceGbp: typeof row.price === "number" ? row.price : undefined,
    });
  }
  return out;
}

/**
 * Optional cue for which orientation the work should display in. Comes
 * from `ArtistWork.orientation` in the static seed; database-backed
 * works can populate it the same way. When supplied, pickDefaultSize
 * swaps dims so the chosen size matches the work's intended
 * orientation, fixes the "every portrait shows landscape" bug where
 * the listed pricing label is in the rotated form.
 */
export type WorkOrientation = "portrait" | "landscape" | "square";

/**
 * Pick the best default size when a work is dragged onto a wall.
 *
 * Order of preference:
 *   1. The LARGEST listed pricing variant, this is what the venue is
 *      likely to actually buy and hang. Visually accurate to the item
 *      they're previewing.
 *   2. The natural `dimensions` field (the original artwork size) if it
 *      parses, works as a fallback when no print sizes are listed.
 *   3. null, caller falls back to its own default.
 *
 * After picking, dims are swapped if the result disagrees with the
 * work's orientation hint. Listed prices like '20×28" (50×70cm)' parse
 * as 50×70 (portrait) but the underlying artwork might be a landscape
 *, without the swap, the image gets squashed into the wrong-shape box.
 */
export function pickDefaultSize(input: {
  dimensions: string | null | undefined;
  variants: SizeVariant[];
  orientation?: WorkOrientation;
}): { widthCm: number; heightCm: number; sizeLabel?: string } | null {
  let result: { widthCm: number; heightCm: number; sizeLabel?: string } | null;

  if (input.variants.length > 0) {
    // Largest by area.
    const largest = [...input.variants].sort(
      (a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm,
    )[0];
    result = {
      widthCm: largest.widthCm,
      heightCm: largest.heightCm,
      sizeLabel: largest.label,
    };
  } else {
    const natural = parseDimensions(input.dimensions ?? null);
    if (natural) {
      result = {
        widthCm: natural.widthCm,
        heightCm: natural.heightCm,
        sizeLabel: input.dimensions ?? undefined,
      };
    } else {
      return null;
    }
  }

  // Orientation alignment.
  if (input.orientation && input.orientation !== "square") {
    const isPortrait = result.heightCm > result.widthCm;
    const wantsPortrait = input.orientation === "portrait";
    if (isPortrait !== wantsPortrait) {
      result = {
        widthCm: result.heightCm,
        heightCm: result.widthCm,
        sizeLabel: result.sizeLabel,
      };
    }
  }
  return result;
}

/**
 * Find the next (or previous) size variant relative to the currently
 * selected one. Used by the toolbar's size cycle button. Wraps around
 * at the ends. Falls back to the largest/smallest variant if the
 * current label isn't found in the variants list.
 */
export function cycleSize(
  variants: SizeVariant[],
  currentLabel: string | null,
  direction: 1 | -1 = 1,
): SizeVariant | null {
  if (variants.length === 0) return null;
  // Sort by area so cycling is monotonic regardless of input order.
  const sorted = [...variants].sort(
    (a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm,
  );
  const idx = currentLabel
    ? sorted.findIndex((v) => v.label === currentLabel)
    : -1;
  if (idx === -1) {
    return direction === 1 ? sorted[0] : sorted[sorted.length - 1];
  }
  const next = (idx + direction + sorted.length) % sorted.length;
  return sorted[next];
}
