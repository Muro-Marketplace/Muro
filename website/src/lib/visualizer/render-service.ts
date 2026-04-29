/**
 * Wall Visualizer, server-side render service.
 *
 * Pipeline (Phase 1, no AI):
 *   1. Build a base canvas (output 1600×1200 webp).
 *   2. Draw the wall, solid colour from `wall_color_hex` (or background
 *      photo when uploaded, Phase 2).
 *   3. For each item:
 *        a. Fetch the artwork image (parallel, with timeout).
 *        b. Resize to inner-artwork dimensions (cm × pxPerCm).
 *        c. Wrap in a frame border (solid colour for MVP, same colour
 *           the canvas shows, so the render matches the on-screen look).
 *        d. Composite a soft drop-shadow underneath.
 *        e. Apply small rotation if any (capped at ±15° by the schema).
 *   4. Output webp at quality 85.
 *
 * Costs: ~50–200ms per item (network + sharp). A 5-item layout typically
 * completes in under 3s. We log timing in the route for observability.
 *
 * Provider abstraction:
 *   This file is the only "Phase 1" provider. PR #7 introduces the
 *   `VisualizerProvider` interface and a `MockProvider` that wraps this
 *   exact code; later providers (Replicate, Stability) implement the
 *   same interface, swapped via env config.
 */

import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeFrameGeometry } from "./frames";
import { generateFrameSvg, generateWallSvg } from "./frame-svg";
import type { LayoutBackground, WallItem } from "./types";

const PHOTOS_BUCKET = "wall-photos";

// ── Tuning ──────────────────────────────────────────────────────────────

// Render output dims. 2400×1800 (was 1600×1200), file size grows
// ~2.25× but the on-screen preview at full-bleed lap/desktop sizes
// no longer looks soft. Wall photos uploaded by venues come in at
// 3000–5000px; pushing the render canvas up means the source
// detail isn't getting squeezed into a tiny composite.
export const OUTPUT_WIDTH_PX = 2400;
export const OUTPUT_HEIGHT_PX = 1800;
const PADDING_PX = 80;

/** Outer canvas colour around the wall. Warm off-white = "studio". */
const STAGE_BG = "#F2EFEA";

/** Drop-shadow tuning. Subtle but noticeable. */
const SHADOW_BLUR_PX = 14;
const SHADOW_OFFSET_PX = 6;
const SHADOW_OPACITY = 0.30;

const FETCH_TIMEOUT_MS = 10_000;

// ── Public types ────────────────────────────────────────────────────────

export interface RenderInput {
  background: LayoutBackground;
  /** Wall dimensions in cm. */
  wallWidthCm: number;
  wallHeightCm: number;
  items: WallItem[];
  /** work_id → { imageUrl } lookup. Items referencing missing ids are skipped. */
  workById: Record<string, { imageUrl: string }>;
}

export interface RenderResult {
  /** Final webp bytes. */
  buffer: Buffer;
  /** Meta-information for logging + DB row. */
  meta: {
    width: number;
    height: number;
    itemCount: number;
    skippedItems: number;
    durationMs: number;
  };
}

// ── Public entry point ──────────────────────────────────────────────────

export async function renderLayout(input: RenderInput): Promise<RenderResult> {
  const startedAt = Date.now();

  // 1. Compute layout geometry in pixels.
  const availW = OUTPUT_WIDTH_PX - PADDING_PX * 2;
  const availH = OUTPUT_HEIGHT_PX - PADDING_PX * 2;
  const pxPerCm = Math.min(
    availW / input.wallWidthCm,
    availH / input.wallHeightCm,
  );
  const wallPxW = input.wallWidthCm * pxPerCm;
  const wallPxH = input.wallHeightCm * pxPerCm;
  const wallX = (OUTPUT_WIDTH_PX - wallPxW) / 2;
  const wallY = (OUTPUT_HEIGHT_PX - wallPxH) / 2;

  // 2. Build wall layer.
  //    - preset: solid colour rect from `wall_color_hex`.
  //    - uploaded: download the source photo from the wall-photos
  //      bucket and resize it to fit the wall area exactly. Falls back
  //      to white-rect-with-warning if the download fails.
  const wallW = Math.round(wallPxW);
  const wallH = Math.round(wallPxH);
  let wallBuffer: Buffer;
  if (input.background.kind === "uploaded" && input.background.image_path) {
    const photo = await fetchWallPhoto(input.background.image_path);
    if (photo) {
      // Resize the photo to exactly the wall area. We use `cover` so a
      // wide photo of a wall fills the area without letterboxing, the
      // user sized the wall in cm; pixel cropping is fine.
      wallBuffer = await sharp(photo)
        .resize({ width: wallW, height: wallH, fit: "cover" })
        .png()
        .toBuffer();
    } else {
      console.warn(
        "[render] could not load wall photo; falling back to white",
        input.background.image_path,
      );
      wallBuffer = await sharp({
        create: {
          width: wallW,
          height: wallH,
          channels: 4,
          background: hexToRgb("#FFFFFF", 1),
        },
      })
        .png()
        .toBuffer();
    }
  } else {
    // Preset wall, render as an SVG with directional light + vignette
    // so the result reads as a 3D-feeling wall, not a flat fill.
    const colorHex =
      input.background.kind === "preset"
        ? input.background.color_hex
        : "FFFFFF";
    const wallSvg = generateWallSvg({
      widthPx: wallW,
      heightPx: wallH,
      colorHex,
    });
    wallBuffer = await sharp(Buffer.from(wallSvg)).png().toBuffer();
  }

  // 3. Build composite list. Order matters, z-index.
  const composites: sharp.OverlayOptions[] = [
    {
      input: wallBuffer,
      left: Math.round(wallX),
      top: Math.round(wallY),
    },
  ];

  // 4. Render each item in parallel (network fetch dominates).
  const sortedItems = [...input.items].sort((a, b) => a.z_index - b.z_index);
  const itemResults = await Promise.all(
    sortedItems.map((item) =>
      renderItem(item, pxPerCm, wallX, wallY, input.workById),
    ),
  );

  let skipped = 0;
  for (const r of itemResults) {
    if (r === null) {
      skipped++;
      continue;
    }
    composites.push(...r);
  }

  // 5. Final composite.
  const finalBuffer = await sharp({
    create: {
      width: OUTPUT_WIDTH_PX,
      height: OUTPUT_HEIGHT_PX,
      channels: 4,
      background: hexToRgb(STAGE_BG, 1),
    },
  })
    .composite(composites)
    // Quality 90: noticeable jump in cleanliness on detail-heavy
    // venue photo backgrounds. ~30% larger files than 85, still
    // streams comfortably over typical UK broadband.
    .webp({ quality: 90 })
    .toBuffer();

  return {
    buffer: finalBuffer,
    meta: {
      width: OUTPUT_WIDTH_PX,
      height: OUTPUT_HEIGHT_PX,
      itemCount: sortedItems.length - skipped,
      skippedItems: skipped,
      durationMs: Date.now() - startedAt,
    },
  };
}

// ── Item rendering ──────────────────────────────────────────────────────

/**
 * Build the (shadow + frame + artwork) overlay set for one item.
 * Returns null if the work image can't be fetched.
 */
async function renderItem(
  item: WallItem,
  pxPerCm: number,
  wallOriginX: number,
  wallOriginY: number,
  workById: Record<string, { imageUrl: string }>,
): Promise<sharp.OverlayOptions[] | null> {
  const work = workById[item.work_id];
  if (!work?.imageUrl) {
    console.warn(`[render] no image for work ${item.work_id}; skipping item`);
    return null;
  }

  // Clamp the item dimensions to fit within the output canvas. If
  // an artist resized an artwork larger than the wall (or the wall
  // is small relative to the canvas), the raw cm × pxPerCm could
  // exceed OUTPUT_*_PX. sharp's composite then errors with
  //   "Image to composite must have same dimensions or smaller"
  // and we lose the entire render. Clamping caps the framed-item
  // buffer at the canvas size, the artist sees their work rendered
  // up to the wall edge instead of an opaque failure.
  const itemPxW = Math.max(
    1,
    Math.min(OUTPUT_WIDTH_PX, Math.round(item.width_cm * pxPerCm)),
  );
  const itemPxH = Math.max(
    1,
    Math.min(OUTPUT_HEIGHT_PX, Math.round(item.height_cm * pxPerCm)),
  );
  const itemX = Math.round(wallOriginX + item.x_cm * pxPerCm);
  const itemY = Math.round(wallOriginY + item.y_cm * pxPerCm);

  // Fetch artwork.
  let artworkBuffer: Buffer;
  try {
    artworkBuffer = await fetchImage(work.imageUrl);
  } catch (err) {
    console.warn(`[render] image fetch failed for ${item.work_id}:`, err);
    return null;
  }

  const frameGeo = computeFrameGeometry(itemPxW, itemPxH, item.frame);

  // Resize artwork to inner dimensions.
  const innerW = Math.max(1, Math.round(frameGeo.artwork.width));
  const innerH = Math.max(1, Math.round(frameGeo.artwork.height));
  const artworkResized = await sharp(artworkBuffer)
    .resize({ width: innerW, height: innerH, fit: "fill" })
    .png()
    .toBuffer();

  // Build the framed item itself. Order matters:
  //   1. Start with a transparent canvas at the item size.
  //   2. Lay down the artwork at the inner offset.
  //   3. Composite the SVG-generated frame ring on top, its even-odd
  //      cut-out keeps the artwork visible inside the frame opening.
  // For style='none' we just return the resized artwork.
  let itemImage: Buffer;
  if (item.frame.style === "none") {
    itemImage = artworkResized;
  } else {
    // Transparent base canvas.
    const base = await sharp({
      create: {
        width: itemPxW,
        height: itemPxH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    // Generate the SVG frame. May return null if the border is too
    // thin to draw (e.g. a 1px wallpaper border on a tiny item), fall
    // back to the solid-colour rect for that case.
    const frameSvg = generateFrameSvg({
      outerWidthPx: itemPxW,
      outerHeightPx: itemPxH,
      borderPx: frameGeo.borderPx,
      frame: item.frame,
    });
    let frameLayer: Buffer;
    if (frameSvg) {
      frameLayer = await sharp(Buffer.from(frameSvg)).png().toBuffer();
    } else {
      // Fallback: solid colour ring (legacy behaviour).
      frameLayer = await sharp({
        create: {
          width: itemPxW,
          height: itemPxH,
          channels: 4,
          background: hexToRgb(frameGeo.borderColor ?? "#222222", 1),
        },
      })
        .png()
        .toBuffer();
    }

    itemImage = await sharp(base)
      .composite([
        // Artwork inset under the frame.
        {
          input: artworkResized,
          left: Math.round(frameGeo.artwork.x),
          top: Math.round(frameGeo.artwork.y),
        },
        // Frame ring on top, its inner area is transparent so the
        // artwork shows through cleanly.
        {
          input: frameLayer,
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
  }

  // Apply rotation if any (only ±15° by schema).
  if (Math.abs(item.rotation_deg) > 0.05) {
    itemImage = await sharp(itemImage)
      .rotate(item.rotation_deg, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  // Build a soft drop-shadow underneath. Disabled by default for 2D
  // renders, artists asked to ship the rendered image without
  // shadows because the 2D preset walls already render with their
  // own SVG-based lighting + vignette, and the per-item shadow on
  // top read as a duplicate "fake 3D" effect. The 3D preview in the
  // editor still shades naturally because that uses three.js
  // materials, not sharp composites. Flip SHADOWS_ENABLED back on if
  // a future preset wants a flat-colour wall + drop-shadow combo.
  const SHADOWS_ENABLED = false;
  const shadowOverlay: sharp.OverlayOptions[] = [];
  if (SHADOWS_ENABLED && (frameGeo.hasShadow || item.frame.style === "none")) {
    // Mask a semi-transparent black layer to the item's silhouette. Sharp's
    // "in" blend keeps source pixels only where the destination is opaque,
    // giving us a soft-blurred shadow that hugs the item shape (including
    // any rotated frame corners).
    //
    // Sharp's hard rule: the composite *input* must be ≤ the base in both
    // dimensions. itemImage may be itemPxW × itemPxH, OR slightly larger
    // after `.rotate()` expands the bounding box, so we read the actual
    // size from metadata and size the SVG to match exactly. The previous
    // version used `itemPxW + 100` × `itemPxH + 100` for the SVG, which
    // was strictly larger than the base on every non-rotated item and
    // crashed the entire render with "Image to composite must have same
    // dimensions or smaller". The blur still produces a soft falloff at
    // the silhouette edges within the canvas, the +100 padding was
    // attempting to "give the blur room to spread" but it was on the
    // wrong side of the composite operation.
    const itemMeta = await sharp(itemImage).metadata();
    const shadowW = itemMeta.width ?? itemPxW;
    const shadowH = itemMeta.height ?? itemPxH;
    const shadowSilhouette = await sharp(itemImage)
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${shadowW}" height="${shadowH}">` +
              `<rect width="100%" height="100%" fill="black" opacity="${SHADOW_OPACITY}"/>` +
              `</svg>`,
          ),
          blend: "in",
        },
      ])
      .blur(SHADOW_BLUR_PX)
      .toBuffer();
    shadowOverlay.push({
      input: shadowSilhouette,
      left: itemX + SHADOW_OFFSET_PX,
      top: itemY + SHADOW_OFFSET_PX,
    });
  }

  // Defensive clamp before the final composite. The final 1600×1200
  // canvas requires every overlay to be ≤ canvas in both dimensions.
  // sharp.rotate() expands its output bounding box to fit the rotated
  // content, and the SVG-rendered frame ring can land 1–2px wider than
  // requested when feTurbulence/radialGradient filter regions round up.
  // Either case throws "Image to composite must have same dimensions
  // or smaller" with no useful stack frame to point at, so we cap
  // both itemImage and the shadow buffer here once, after all the
  // per-item work is done.
  itemImage = await fitToCanvas(itemImage);
  for (let i = 0; i < shadowOverlay.length; i++) {
    const buf = shadowOverlay[i].input;
    if (buf instanceof Buffer) {
      shadowOverlay[i] = {
        ...shadowOverlay[i],
        input: await fitToCanvas(buf),
      };
    }
  }

  return [
    ...shadowOverlay,
    {
      input: itemImage,
      left: itemX,
      top: itemY,
    },
  ];
}

// ── Storage fetching (wall photos) ──────────────────────────────────────

/**
 * Download an uploaded wall photo from the private `wall-photos`
 * bucket using the service-role client. Returns null on any failure,
 * the caller falls back to a solid colour wall.
 */
async function fetchWallPhoto(path: string): Promise<Buffer | null> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.storage
      .from(PHOTOS_BUCKET)
      .download(path);
    if (error || !data) {
      console.warn("[render] wall photo download failed:", error?.message);
      return null;
    }
    const arr = await data.arrayBuffer();
    return Buffer.from(arr);
  } catch (err) {
    console.warn("[render] wall photo download threw:", err);
    return null;
  }
}

// ── Image fetching ──────────────────────────────────────────────────────

/**
 * Fetch an image URL into a Buffer with a timeout. Caller catches errors.
 */
async function fetchImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } finally {
    clearTimeout(timeout);
  }
}

// ── Buffer fit helpers ──────────────────────────────────────────────────

/**
 * Guarantee a buffer's dimensions are within the output canvas. If
 * either side exceeds the canvas, resize down using `fit: "inside"` so
 * the content stays in proportion. No-op if it already fits.
 *
 * Why we need this: rotation expands the bounding box, sharp's SVG
 * renderer can output 1–2px over the requested dimensions for
 * filter-heavy frames (turbulence/radial gradient region rounding),
 * and the final composite onto the 1600×1200 canvas refuses any
 * overlay larger than the base. The original symptom was an opaque
 * "Render failed: Image to composite must have same dimensions or
 * smaller" with the failing line buried inside a renderItem path.
 * Clamping every per-item buffer once at the end of renderItem makes
 * the failure mode impossible by construction.
 */
async function fitToCanvas(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= OUTPUT_WIDTH_PX && h <= OUTPUT_HEIGHT_PX) return buf;
  return sharp(buf)
    .resize({
      width: OUTPUT_WIDTH_PX,
      height: OUTPUT_HEIGHT_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
}

// ── Colour helpers ──────────────────────────────────────────────────────

function hexToRgb(hex: string, alpha = 1): {
  r: number;
  g: number;
  b: number;
  alpha: number;
} {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return {
    r: Number.isNaN(r) ? 255 : r,
    g: Number.isNaN(g) ? 255 : g,
    b: Number.isNaN(b) ? 255 : b,
    alpha,
  };
}
