/**
 * Preset wall library.
 *
 * Stock walls users can pick when starting a layout without uploading a
 * photo. Each preset declares:
 *   - id              stable identifier persisted on `walls.preset_id`
 *   - name            short human label shown in the picker
 *   - description     longer line below the name
 *   - default colour  starting wall colour swatch (hex without '#')
 *   - default width / height, the user can override these per-wall
 *   - imagePath       optional /public path; null for solid-colour presets
 *   - vibe            tag used for filtering/grouping the picker UI
 *
 * Image assets land in PR #5, until then, presets render as a solid
 * colour backdrop. The editor code already supports `imagePath = null`,
 * so the same data flow works with or without imagery.
 */

export type PresetVibe = "minimal" | "warm" | "industrial" | "gallery";

export interface PresetWall {
  id: string;
  name: string;
  description: string;
  defaultColorHex: string;
  defaultWidthCm: number;
  defaultHeightCm: number;
  imagePath: string | null;
  vibe: PresetVibe;
}

export const PRESET_WALLS: readonly PresetWall[] = [
  {
    id: "minimal_white",
    name: "Minimal white",
    description: "A clean off-white wall, works for most pieces.",
    defaultColorHex: "F5F1EB",
    defaultWidthCm: 300,
    defaultHeightCm: 240,
    imagePath: null,
    vibe: "minimal",
  },
  {
    id: "warm_plaster",
    name: "Warm plaster",
    description: "Soft beige, flatters earthy palettes and photography.",
    defaultColorHex: "E8DECF",
    defaultWidthCm: 320,
    defaultHeightCm: 240,
    imagePath: null,
    vibe: "warm",
  },
  {
    id: "industrial_concrete",
    name: "Industrial concrete",
    description: "Cool grey concrete, great for bold, graphic work.",
    defaultColorHex: "BCBAB6",
    defaultWidthCm: 360,
    defaultHeightCm: 260,
    imagePath: null,
    vibe: "industrial",
  },
  {
    id: "gallery_charcoal",
    name: "Gallery charcoal",
    description: "Dark gallery wall, pulls light works forward.",
    defaultColorHex: "2A2A2A",
    defaultWidthCm: 400,
    defaultHeightCm: 260,
    imagePath: null,
    vibe: "gallery",
  },
] as const;

const PRESET_BY_ID: ReadonlyMap<string, PresetWall> = new Map(
  PRESET_WALLS.map((p) => [p.id, p]),
);

export function getPresetWall(id: string): PresetWall | undefined {
  return PRESET_BY_ID.get(id);
}

export function isPresetWallId(id: string): boolean {
  return PRESET_BY_ID.has(id);
}
