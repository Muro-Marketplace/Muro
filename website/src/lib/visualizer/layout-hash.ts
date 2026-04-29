/**
 * Deterministic layout hash.
 *
 * Used as the render cache key. Two layouts with the same items + same
 * wall produce the same hash, so re-rendering an unchanged layout can
 * short-circuit to a cached image without consuming quota.
 *
 * Determinism rules:
 *   - Items are sorted by `id` before hashing so insertion order doesn't
 *     change the result.
 *   - Numeric fields are coerced to fixed precision (3 decimals) so
 *     drag-end float wobble like 100.0000000003 vs 100.0 doesn't blow
 *     the cache.
 *   - We hash a JSON string with explicit key ordering, not raw JSON
 *     (key order in JSON.stringify isn't guaranteed across engines for
 *     non-array values).
 */

import { createHash } from "node:crypto";
import type { LayoutBackground, WallItem } from "./types";

interface HashInput {
  items: WallItem[];
  background: LayoutBackground;
  width_cm: number;
  height_cm: number;
}

/**
 * Round a number to 3 decimals. Why 3:
 *   - 0.001 cm = 10 microns, well below any user-perceivable precision.
 *   - Stops `setItem(x_cm: 100.0000000003)` from being a different hash
 *     than `setItem(x_cm: 100)` after a drag jitter.
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Produce a canonical string for the input. Important: every shape we
 * embed here must produce the SAME output for inputs that are
 * semantically equal, that's the whole point.
 */
function canonicalise(input: HashInput): string {
  const sortedItems = [...input.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => {
      // Build the object key-by-key so order is fixed regardless of
      // what JSON.stringify does internally.
      const obj = {
        id: it.id,
        work_id: it.work_id,
        x_cm: round3(it.x_cm),
        y_cm: round3(it.y_cm),
        width_cm: round3(it.width_cm),
        height_cm: round3(it.height_cm),
        rotation_deg: round3(it.rotation_deg),
        z_index: it.z_index,
        frame: {
          style: it.frame.style,
          finish: it.frame.finish,
          depth_mm: round3(it.frame.depth_mm),
        },
      };
      return obj;
    });

  let bg: Record<string, unknown>;
  if (input.background.kind === "preset") {
    bg = {
      kind: "preset",
      preset_id: input.background.preset_id,
      color_hex: input.background.color_hex.toUpperCase(),
    };
  } else {
    bg = {
      kind: "uploaded",
      image_path: input.background.image_path,
      perspective: input.background.perspective ?? null,
    };
  }

  // Top-level shape with fixed key order.
  const top = {
    background: bg,
    width: round3(input.width_cm),
    height: round3(input.height_cm),
    items: sortedItems,
  };

  return JSON.stringify(top);
}

/**
 * Returns the hex sha256 of the canonicalised input. 64 chars; safe to
 * store in a TEXT column.
 */
export function computeLayoutHash(input: HashInput): string {
  const canonical = canonicalise(input);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Exposed for tests, useful for asserting determinism without cracking sha256. */
export const _canonicaliseForTests = canonicalise;
