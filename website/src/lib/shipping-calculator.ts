/**
 * UK shipping calculator for artwork.
 *
 * Inputs: the listed dimensions string (freeform, "A3", "50 x 70 cm",
 * "70x100cm", etc.), plus whether the piece is framed. We don't have
 * per-work weight on file today, so weight is derived from size + framed
 * flag using sensible density assumptions (canvas ~0.6 kg/m² unframed,
 * +~1.5 kg for a timber frame + glass up to A2, +~3 kg above).
 *
 * Pricing is modelled on Royal Mail + Parcelforce tracked rates with
 * a small margin for packaging materials (cardboard, corner protectors,
 * tissue), recalibrated 2026-04 against current courier prices, the
 * old table was running ~25-30% above real costs and pricing artists
 * out of orders unnecessarily:
 *
 *   Tier      | Longest edge | Weight | Domestic UK | International
 *   --------- | ------------ | ------ | ----------- | -------------
 *   Flat      | ≤ A4 (30cm)  | ≤ 1kg  | £3.50       | £10
 *   Small     | ≤ 50cm       | ≤ 2kg  | £6.50       | £18
 *   Medium    | ≤ 80cm       | ≤ 5kg  | £10.50      | £28
 *   Large     | ≤ 120cm      | ≤ 15kg | £18.00      | £48
 *   Oversized | > 120cm      | > 15kg | £35.00      | £95
 *
 * £100+ orders automatically add the signature-on-delivery uplift (£2)
 *, this mirrors the terms policy.
 */

export type ShippingTier = "flat" | "small" | "medium" | "large" | "oversized";

export interface ShippingEstimate {
  /** Total shipping cost in GBP (includes signature uplift if applicable). */
  cost: number;
  /** Base cost before signature uplift, for display transparency. */
  baseCost: number;
  /** Signature-on-delivery uplift, if any. */
  signatureUplift: number;
  /** Computed tier, useful for UI copy. */
  tier: ShippingTier;
  /** Human-readable delivery window. */
  estimatedDays: string;
  /** Whether signature-on-delivery applies (£100+ orders). */
  requiresSignature: boolean;
  /** Longest edge in cm used in the calculation. */
  longestEdgeCm: number;
  /** Estimated weight in kg used in the calculation. */
  estimatedWeightKg: number;
  /** The region used for pricing. */
  region: "uk" | "international";
}

/**
 * Parse a freeform dimensions string into cm × cm. Handles:
 *   "A4" / "A3" / "A2" / "A1" / "A0"
 *   "50 x 70 cm" / "50x70cm" / "50 × 70 cm"
 *   "3 x 20x30 cm"  (multi-piece, largest dimension wins)
 *   "100 x 120 cm"
 * Returns null when unparseable.
 */
export function parseDimensions(raw: string | null | undefined): { widthCm: number; heightCm: number } | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const A_SIZES: Record<string, { widthCm: number; heightCm: number }> = {
    a0: { widthCm: 84, heightCm: 119 },
    a1: { widthCm: 59, heightCm: 84 },
    a2: { widthCm: 42, heightCm: 59 },
    a3: { widthCm: 30, heightCm: 42 },
    a4: { widthCm: 21, heightCm: 30 },
    a5: { widthCm: 15, heightCm: 21 },
  };
  if (A_SIZES[s]) return A_SIZES[s];

  // A-size anywhere in the string wins, labels like "8×10\" (A4)" should
  // resolve to A4, not the inch numbers.
  const aMatch = s.match(/\ba([0-5])\b/);
  if (aMatch) {
    const key = `a${aMatch[1]}`;
    if (A_SIZES[key]) return A_SIZES[key];
  }

  // Unit markers. `\bcm\b` fails on "70cm" because there's no word
  // boundary between a digit and a letter, so we match `cm` preceded by
  // a digit or whitespace and followed by a non-letter.
  const hasCm = /(?:\d|\s)cm(?![a-z])/.test(s);
  const hasMm = /(?:\d|\s)mm(?![a-z])/.test(s);
  // Inch marker (" or 'in'/'inch').
  const hasInch = /["″]|\b(in|inch|inches)\b/.test(s);

  // If the string mixes units (e.g. "8×10\" (A4)" or "20×28\" (50×70cm)"),
  // the authoritative cm block wins, extract numbers from the cm half.
  if (hasCm) {
    const cmChunk = s.split(/cm/)[0] + "cm";
    const cmNums = (cmChunk.match(/\d+(?:\.\d+)?/g) || []).map(parseFloat).filter((n) => n > 0);
    if (cmNums.length >= 2) {
      const last = cmNums.slice(-2).sort((a, b) => b - a);
      return { widthCm: Math.round(last[1]), heightCm: Math.round(last[0]) };
    }
  }

  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(parseFloat).filter((n) => n > 0);
  if (nums.length >= 2) {
    nums.sort((a, b) => b - a);
    const [h, w] = nums;
    let scale = 1;
    if (hasMm || nums.some((n) => n > 300)) scale = 0.1; // mm
    else if (hasInch && !hasCm) scale = 2.54; // inches → cm
    return { widthCm: Math.round(w * scale), heightCm: Math.round(h * scale) };
  }

  return null;
}

/**
 * Per-medium density (kg/m²) estimates. Values taken from UK art-supply
 * catalogue norms (fine-art paper ~0.2, canvas ~0.5–0.7, board/wood
 * ~1.0, sculpture treated separately).
 */
const MEDIUM_DENSITY_KG_PER_M2: { test: RegExp; density: number; label: string }[] = [
  { test: /digital|download|pdf/i, density: 0, label: "digital" },
  { test: /print|giclee|gicl\xe9e|poster|photograph/i, density: 0.25, label: "print" },
  { test: /watercolou?r|gouache|ink|pastel|charcoal|drawing|sketch|paper/i, density: 0.3, label: "paper" },
  { test: /photograph|photo|c-type|darkroom/i, density: 0.3, label: "photo" },
  { test: /canvas|oil|acrylic|painting/i, density: 0.6, label: "canvas" },
  { test: /panel|board|mdf|wood|plywood/i, density: 1.2, label: "board" },
  { test: /ceramic|clay|porcelain|stoneware/i, density: 3.0, label: "ceramic" },
  { test: /metal|steel|bronze|iron|aluminium/i, density: 4.5, label: "metal" },
  { test: /sculpture/i, density: 2.5, label: "sculpture" },
  { test: /mixed media|collage|textile/i, density: 0.5, label: "mixed" },
];

function densityForMedium(medium: string | null | undefined): number {
  if (!medium) return 0.6;
  for (const row of MEDIUM_DENSITY_KG_PER_M2) {
    if (row.test.test(medium)) return row.density;
  }
  return 0.6;
}

/**
 * Weight estimate from size + medium + frame. Packaging allowance
 * scales with the piece so a 150cm canvas doesn't share weight with
 * a postcard.
 */
function estimateWeightKg(
  longestEdgeCm: number,
  shortestEdgeCm: number,
  framed: boolean,
  medium?: string | null,
): number {
  const areaM2 = (longestEdgeCm * shortestEdgeCm) / 10000;
  const density = densityForMedium(medium);
  const baseKg = density * areaM2;
  // Frame + glass for framed works. Bigger frames are disproportionately
  // heavier because glass weight scales with area.
  const frameKg = framed
    ? areaM2 > 0.6
      ? 3.5
      : areaM2 > 0.25
        ? 2.0
        : 1.0
    : 0;
  // Packaging: cardboard, corner protectors, acid-free tissue. Scales
  // roughly linearly with the longest edge.
  const packagingKg = 0.3 + longestEdgeCm * 0.005;
  return Math.max(0.2, baseKg + frameKg + packagingKg);
}

function tierForSize(longestEdgeCm: number, weightKg: number): ShippingTier {
  if (longestEdgeCm <= 30 && weightKg <= 1) return "flat";
  if (longestEdgeCm <= 50 && weightKg <= 2) return "small";
  if (longestEdgeCm <= 80 && weightKg <= 5) return "medium";
  if (longestEdgeCm <= 120 && weightKg <= 15) return "large";
  return "oversized";
}

const PRICING: Record<ShippingTier, { uk: number; international: number; days: string }> = {
  flat:      { uk: 3.50,  international: 10.00, days: "2–3 working days" },
  small:     { uk: 6.50,  international: 18.00, days: "3–5 working days" },
  medium:    { uk: 10.50, international: 28.00, days: "3–7 working days" },
  large:     { uk: 18.00, international: 48.00, days: "5–10 working days" },
  oversized: { uk: 35.00, international: 95.00, days: "7–14 working days (specialist courier)" },
};

/** Orders at or above this price automatically ship signed-for. Terms §7. */
export const SIGNATURE_THRESHOLD_GBP = 100;
const SIGNATURE_UPLIFT_GBP = 2;

interface EstimateInput {
  dimensions?: string | null;
  framed?: boolean;
  priceGbp?: number;
  region?: "uk" | "international";
  /** Medium string from the work ("Oil on canvas", "Giclée print", …).
      Drives weight estimation, canvas ≠ paper ≠ ceramic. */
  medium?: string | null;
}

/**
 * Calculate a shipping estimate. Returns null when dimensions are
 * unparseable, caller can fall back to "shipping calculated at checkout"
 * or an artist-set manual price.
 */
export function estimateShipping(input: EstimateInput): ShippingEstimate | null {
  const dims = parseDimensions(input.dimensions);
  if (!dims) return null;

  const longest = Math.max(dims.widthCm, dims.heightCm);
  const shortest = Math.min(dims.widthCm, dims.heightCm);
  const framed = Boolean(input.framed);
  const weight = estimateWeightKg(longest, shortest, framed, input.medium);
  const tier = tierForSize(longest, weight);
  const region = input.region || "uk";
  const p = PRICING[tier];

  const baseCost = region === "uk" ? p.uk : p.international;
  const requiresSignature = (input.priceGbp || 0) >= SIGNATURE_THRESHOLD_GBP;
  const signatureUplift = requiresSignature ? SIGNATURE_UPLIFT_GBP : 0;

  return {
    cost: Math.round((baseCost + signatureUplift) * 100) / 100,
    baseCost,
    signatureUplift,
    tier,
    estimatedDays: p.days,
    requiresSignature,
    longestEdgeCm: longest,
    estimatedWeightKg: Math.round(weight * 10) / 10,
    region,
  };
}

/**
 * Decide which shipping cost to show: the artist's manual value if they
 * set one, otherwise the calculator's estimate.
 */
export function resolveShippingCost(params: {
  manualPrice?: number | null;
  dimensions?: string | null;
  framed?: boolean;
  priceGbp?: number;
  region?: "uk" | "international";
  medium?: string | null;
}): {
  cost: number | null;
  source: "manual" | "estimate" | "unknown";
  estimate: ShippingEstimate | null;
} {
  if (typeof params.manualPrice === "number") {
    return { cost: params.manualPrice, source: "manual", estimate: null };
  }
  const estimate = estimateShipping({
    dimensions: params.dimensions,
    framed: params.framed,
    priceGbp: params.priceGbp,
    region: params.region,
    medium: params.medium,
  });
  if (estimate) return { cost: estimate.cost, source: "estimate", estimate };
  return { cost: null, source: "unknown", estimate: null };
}

/** Short human-friendly label for the tier. */
export function tierLabel(tier: ShippingTier): string {
  return {
    flat: "Letter / flat",
    small: "Small parcel",
    medium: "Medium parcel",
    large: "Large parcel",
    oversized: "Oversized, specialist courier",
  }[tier];
}
