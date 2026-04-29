/**
 * Wall Visualizer, zod schemas.
 *
 * The runtime contract for everything the editor and API exchange. Used:
 *   - On API routes (server-side input validation)
 *   - On the editor (before persisting to /api/walls/*, catches dev mistakes early)
 *   - On the render service (defensive parse before composing)
 *
 * Layered with src/lib/visualizer/types.ts: the TS interfaces are the
 * canonical structural types; the zod schemas validate runtime payloads.
 * They MUST stay in sync, the test in validations.test.ts asserts
 * structural compatibility for the key shapes.
 */

import { z } from "zod";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Hex without leading '#', exactly 6 characters. */
const hexColor6 = z
  .string()
  .trim()
  .regex(/^[0-9A-Fa-f]{6}$/, "Must be a 6-character hex colour without '#'");

/** Wall dimension in cm. Bounded to catch metres-vs-cm mistakes. */
const wallDimensionCm = z.number().min(50).max(1000);

/** Item dimension in cm. Smaller minimum so sketches/postcards work. */
const itemDimensionCm = z.number().min(5).max(1000);

/** Item position in cm. Negative allowed (item partially off-canvas during drag). */
const itemPositionCm = z.number().min(-1000).max(2000);

/** Stable client-generated UUID-ish, accepts any non-empty short string so
 *  the editor can assign keys without needing crypto.randomUUID server-side. */
const itemId = z.string().min(1).max(64);

// ── Frame ───────────────────────────────────────────────────────────────

export const frameStyleSchema = z.enum([
  "none",
  "thin_black",
  "classic_wood",
  "ornate_gold",
  "floater",
]);

export const frameConfigSchema = z.object({
  style: frameStyleSchema,
  /** Free string so we can extend finishes without migration; bounded length. */
  finish: z.string().min(0).max(40).default(""),
  depth_mm: z.number().min(0).max(100).default(0),
});

// ── Wall item ───────────────────────────────────────────────────────────

export const wallItemSchema = z.object({
  id: itemId,
  work_id: z.string().min(1).max(64),
  x_cm: itemPositionCm,
  y_cm: itemPositionCm,
  width_cm: itemDimensionCm,
  height_cm: itemDimensionCm,
  rotation_deg: z.number().min(-15).max(15).default(0),
  z_index: z.number().int().min(0).max(1000).default(0),
  frame: frameConfigSchema,
  /** The size variant the user picked, e.g. '16×24" (A2)'. Optional. */
  size_label: z.string().trim().min(1).max(80).optional(),
});

// ── Wall (create) ───────────────────────────────────────────────────────

/** Shared base, fields every wall has regardless of kind. */
const wallBaseFields = {
  name: z.string().trim().min(1).max(120),
  width_cm: wallDimensionCm,
  height_cm: wallDimensionCm,
  wall_color_hex: hexColor6.default("FFFFFF"),
  notes: z.string().trim().max(1000).optional(),
  owner_type: z.enum(["venue", "artist", "customer"]),
};

export const createPresetWallSchema = z.object({
  ...wallBaseFields,
  kind: z.literal("preset"),
  preset_id: z.string().min(1).max(64),
});

export const createUploadedWallSchema = z.object({
  ...wallBaseFields,
  kind: z.literal("uploaded"),
  source_image_path: z.string().min(1).max(500),
});

/** Discriminated union, pick the right shape based on `kind`. */
export const createWallSchema = z.discriminatedUnion("kind", [
  createPresetWallSchema,
  createUploadedWallSchema,
]);

// ── Wall (update) ───────────────────────────────────────────────────────

/**
 * Updates are partial. `kind` cannot change after creation, switching
 * between preset and uploaded would require resetting layouts.
 */
export const updateWallSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  width_cm: wallDimensionCm.optional(),
  height_cm: wallDimensionCm.optional(),
  wall_color_hex: hexColor6.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  // Migration 037, venue-controlled toggle that publishes the wall
  // on the venue's public profile page so artists can see it before
  // requesting placements.
  is_public_on_profile: z.boolean().optional(),
});

// ── Layout ──────────────────────────────────────────────────────────────

export const wallLayoutItemsSchema = z
  .array(wallItemSchema)
  .max(50, "A layout can hold at most 50 artworks");

export const createLayoutSchema = z.object({
  wall_id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  items: wallLayoutItemsSchema.default([]),
});

export const updateLayoutSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  items: wallLayoutItemsSchema.optional(),
});

// ── Render ──────────────────────────────────────────────────────────────

export const renderKindSchema = z.enum(["standard", "hd", "showroom"]);

/**
 * Body for POST /api/walls/[id]/layouts/[lid]/render.
 *
 * We allow an optional `items` override so the artwork-page flow can render
 * an unsaved layout (e.g. customer pre-places a work on a preset wall and
 * hits Generate without saving). When omitted, we render the persisted layout.
 */
export const renderRequestSchema = z.object({
  kind: renderKindSchema.default("standard"),
  items: wallLayoutItemsSchema.optional(),
});

/**
 * Body for ad-hoc renders that don't have a layout row at all (the
 * customer-on-artwork-page "quick preview" path before they save anything).
 * Sent to POST /api/walls/render-quick.
 */
export const quickRenderRequestSchema = z.object({
  /** Existing wall to render against (if user has saved walls). */
  wall_id: z.string().min(1).max(64).optional(),
  /** Or: stock preset to render against (no wall row needed). */
  preset_id: z.string().min(1).max(64).optional(),
  /** Required when preset_id is supplied. */
  width_cm: wallDimensionCm.optional(),
  height_cm: wallDimensionCm.optional(),
  wall_color_hex: hexColor6.optional(),
  /** The single artwork to place, quick preview is one work at a time. */
  work_id: z.string().min(1).max(64),
  /** Optional placement override; otherwise we centre at default size. */
  placement: z
    .object({
      x_cm: itemPositionCm,
      y_cm: itemPositionCm,
      width_cm: itemDimensionCm,
      height_cm: itemDimensionCm,
      frame: frameConfigSchema,
    })
    .optional(),
  kind: renderKindSchema.default("standard"),
})
  .refine(
    (v) => !!v.wall_id || !!v.preset_id,
    { message: "Provide wall_id or preset_id" },
  )
  .refine(
    (v) =>
      !v.preset_id || (typeof v.width_cm === "number" && typeof v.height_cm === "number"),
    { message: "preset_id requires width_cm and height_cm" },
  );

// ── Mockup save ─────────────────────────────────────────────────────────

/**
 * Body for POST /api/works/[id]/mockups, promotes a render to an artwork
 * mockup on the listing.
 */
export const saveMockupSchema = z.object({
  render_id: z.string().min(1).max(64),
});

// ── Inferred types (matches src/lib/visualizer/types.ts at runtime) ─────

export type CreateWallInput = z.infer<typeof createWallSchema>;
export type UpdateWallInput = z.infer<typeof updateWallSchema>;
export type CreateLayoutInput = z.infer<typeof createLayoutSchema>;
export type UpdateLayoutInput = z.infer<typeof updateLayoutSchema>;
export type RenderRequestInput = z.infer<typeof renderRequestSchema>;
export type QuickRenderRequestInput = z.infer<typeof quickRenderRequestSchema>;
export type SaveMockupInput = z.infer<typeof saveMockupSchema>;
