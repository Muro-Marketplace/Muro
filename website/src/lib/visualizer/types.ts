/**
 * Wall Visualizer, canonical TypeScript types.
 *
 * These types are the single source of truth for everything the editor
 * canvas, the layout JSON, the API routes, and the render service exchange.
 *
 * Coordinate system:
 *   All positions and sizes on a wall are stored in CENTIMETRES (cm), not
 *   pixels. The canvas multiplies by a single `pxPerCm` factor at render
 *   time. This makes layouts resolution-independent and lets us re-render
 *   at any output size in future without migrating data.
 *
 * See website/docs/products/WALL_VISUALIZER.md for the spec.
 */

// ── Wall ────────────────────────────────────────────────────────────────

/**
 * Whether the wall was started from a stock preset or from an uploaded
 * photograph of a real wall.
 */
export type WallKind = "preset" | "uploaded";

/**
 * Which Wallplace persona this wall belongs to. A single auth user can be
 * both an artist and a venue contact, so we record the intent at create
 * time. Drives portal navigation + tier resolution.
 */
export type WallOwnerType = "venue" | "artist" | "customer";

/**
 * 3x3 perspective homography matrix encoded row-major. Used to warp the
 * uploaded wall photo into a flat plane for placement, derived from the
 * four corners the user taps in the editor. Phase 2+.
 */
export type Homography = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export interface Wall {
  id: string;
  user_id: string;
  owner_type: WallOwnerType;
  name: string;
  kind: WallKind;
  /** When kind = 'preset': identifier of the stock wall (e.g. 'cafe_back_wall'). */
  preset_id: string | null;
  /** When kind = 'uploaded': Supabase Storage path to the original photo. */
  source_image_path: string | null;
  /** Server-minted short-lived signed URL for `source_image_path`. Only
      populated by GET /api/walls so list cards can show the actual
      photo as a thumbnail without each client minting URLs themselves.
      Not stored, recomputed on each list call (1h expiry). */
  source_image_url?: string;
  width_cm: number;
  height_cm: number;
  /** Hex without leading '#' (e.g. 'F5F1EB'). Only meaningful for presets. */
  wall_color_hex: string;
  perspective_homography: Homography | null;
  segmentation_mask_path: string | null;
  notes: string | null;
  /** Venue-controlled, when true the wall renders on the venue's
      public /venues/[slug] page so artists can see it before
      requesting placements. Defaults to false (private). Migration
      037. */
  is_public_on_profile?: boolean;
  created_at: string;
  updated_at: string;
}

// ── Frame ───────────────────────────────────────────────────────────────

/**
 * Available frame styles. Asset names live in /public/frames/<style>.
 * Adding a new style is asset-only; no migration needed.
 */
export type FrameStyle =
  | "none"
  | "thin_black"
  | "classic_wood"
  | "ornate_gold"
  | "floater";

/**
 * Per-style finishes. Different styles support different finishes, UI
 * surfaces them based on a static map (see src/lib/visualizer/frames.ts in
 * a later PR). Stored as a free string here so we can extend without a
 * migration.
 */
export type FrameFinish = string;

export interface FrameConfig {
  style: FrameStyle;
  finish: FrameFinish;
  /** Frame depth in mm. V2+, defaults to 0 in MVP (flat overlay). */
  depth_mm: number;
}

// ── Layout item ─────────────────────────────────────────────────────────

/**
 * A single artwork placed on a wall. Coordinates and dimensions are in cm
 * relative to the top-left of the wall (y grows downwards, matching screen
 * convention).
 */
export interface WallItem {
  /** Stable client-generated UUID, survives saves so React keys stay valid. */
  id: string;
  /** FK to artist_works.id. Used at render time to fetch the source image. */
  work_id: string;

  /** Distance from left edge of wall, in cm. */
  x_cm: number;
  /** Distance from top edge of wall, in cm. */
  y_cm: number;
  /** Width of the displayed artwork on the wall, in cm. */
  width_cm: number;
  /** Height of the displayed artwork on the wall, in cm. */
  height_cm: number;

  /** Small in-plane rotation in degrees. Default 0. Bounded ±15° in validation. */
  rotation_deg: number;

  /** Stack order. Higher = in front. Defaults to insertion order. */
  z_index: number;

  frame: FrameConfig;

  /**
   * The size variant the user picked, e.g. "16×24\" (A2)". Optional,
   * absent for items that were dragged in at "natural" size or sized
   * by hand. When present, the toolbar shows it next to the size cycle
   * button. Persisted in the layout JSON so reloading reflects intent.
   */
  size_label?: string;
}

// ── Layout background ───────────────────────────────────────────────────

/**
 * The two ways a layout knows what wall it sits on.
 *
 * Note: this duplicates some `Wall` fields rather than always joining,
 * because layouts are sometimes rendered without a wall round-trip
 * (e.g. quick previews from the artwork page).
 */
export type LayoutBackground =
  | {
      kind: "preset";
      preset_id: string;
      color_hex: string;
    }
  | {
      kind: "uploaded";
      image_path: string;
      perspective?: Homography;
    };

// ── Layout ──────────────────────────────────────────────────────────────

export interface WallLayout {
  id: string;
  wall_id: string;
  user_id: string;
  name: string;
  items: WallItem[];
  layout_hash: string | null;
  last_render_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The shape persisted into wall_layouts.items (JSONB array). Equivalent to
 * `WallItem[]`, separate alias so the API contract is explicit at the
 * boundary even when types collapse.
 */
export type WallLayoutItems = WallItem[];

/**
 * The minimum required to invoke the render service. Shared between the
 * "generate now" path (existing layout) and the "ad-hoc preview" path
 * (artwork-page flow before a layout is even saved).
 */
export interface RenderableLayout {
  background: LayoutBackground;
  width_cm: number;
  height_cm: number;
  items: WallItem[];
}

// ── Render ──────────────────────────────────────────────────────────────

export type RenderKind = "standard" | "hd" | "showroom";

export interface WallRender {
  id: string;
  layout_id: string | null;
  user_id: string;
  kind: RenderKind;
  output_path: string;
  layout_hash: string;
  cost_units: number;
  kept: boolean;
  provider: string | null;
  prompt_seed: Record<string, unknown> | null;
  created_at: string;
}

// ── Mockup (artwork attachment) ─────────────────────────────────────────

/**
 * Shape of each entry in artist_works.mockups (JSONB array). When an artist
 * promotes a render to "save as mockup", this is what we append.
 */
export interface ArtistWorkMockup {
  render_id: string;
  url: string;
  layout_id: string | null;
  wall_name: string | null;
  created_at: string;
}

// ── Quota ───────────────────────────────────────────────────────────────

/**
 * Subscription/persona keys we resolve to limits. Keep this aligned with
 * the tier names in src/lib/platform-fee.ts (artist side) and the venue
 * subscription plans (when those are added).
 */
export type VisualizerTier =
  | "guest"               // logged-out / anonymous
  | "customer"            // logged-in customer (no artist or venue role)
  | "artist_core"
  | "artist_premium"
  | "artist_pro"
  | "venue_standard"
  | "venue_premium";

export type VisualizerAction =
  | "render_standard"
  | "render_hd"
  | "wall_upload"
  | "showroom_publish"
  | "refund";

export interface TierLimits {
  /** Max paid units consumable per UTC day. */
  daily: number;
  /** Max paid units consumable per UTC month, secondary safety cap. */
  monthly: number;
  /** Max wall photo uploads per UTC day (counts toward daily too). */
  wall_uploads_daily: number;
  /** Max saved walls. -1 = unlimited. */
  saved_walls: number;
  /** Max saved layouts per wall. -1 = unlimited. 0 = saving disabled. */
  saved_layouts_per_wall: number;
  /** Whether this tier can publish a Pro showroom. Phase 3+. */
  can_publish_showroom: boolean;
}

export interface QuotaStatus {
  tier: VisualizerTier;
  limits: TierLimits;
  daily_used: number;
  monthly_used: number;
  daily_remaining: number;
  monthly_remaining: number;
  /** ISO timestamp of next daily reset (00:00 UTC tomorrow). */
  daily_resets_at: string;
  /** ISO timestamp of next monthly reset (00:00 UTC, 1st of next month). */
  monthly_resets_at: string;
  /** Optional support-grant override that's currently active. */
  override_active: boolean;
}

export type QuotaConsumeResult =
  | { ok: true; remaining_daily: number; remaining_monthly: number }
  | {
      ok: false;
      reason: "daily" | "monthly" | "burst";
      resets_at: string;
      tier: VisualizerTier;
    };

// ── Editor props (forward declaration) ──────────────────────────────────

/**
 * Mode tells the editor which surface it's mounted on, so it can adjust
 * chrome (e.g. show "Save to wall" vs "Save to artwork"). The editor
 * component itself ships in a later PR.
 */
export type VisualizerMode =
  | "venue_my_walls"
  | "customer_artwork_page"
  | "artist_mockup"
  | "artist_showroom";

export interface VisualizerEditorProps {
  mode: VisualizerMode;
  /**
   * If set: editor opens with this layout loaded.
   * If null + workId set: editor pre-places the work on a default wall.
   * If null + nothing set: editor opens with empty wall picker.
   */
  initialLayoutId?: string | null;
  /** Pre-place this artwork on the wall when the editor opens. */
  workId?: string | null;
  /** Customer flow only: which wall to load. */
  wallId?: string | null;
  /** Called when the user closes the sheet/modal. */
  onClose?: () => void;
}
