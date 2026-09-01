// What, if anything, the wall row needs written when a layout autosaves.
//
// The wall row owns the physical canvas: its dimensions and, for preset
// walls, its colour. The layout owns the items. Autosave PATCHes the layout
// every time and the wall only when the wall's own fields actually changed,
// so an ordinary item drag does not re-write the wall row.
//
// E35: the colour was missing from this decision entirely. The config bar
// leaves the colour controls enabled on a saved wall, so a recolour repainted
// the canvas, was never sent, and vanished on the next reload. Extracted here
// rather than left inline in the component so the gate is testable.

export interface WallSaveSnapshot {
  width_cm: number;
  height_cm: number;
  /** Preset walls carry a colour; uploaded walls carry a photo instead. */
  wall_color_hex: string | null;
}

export interface WallPatchBody {
  width_cm: number;
  height_cm: number;
  wall_color_hex?: string;
}

/**
 * The PATCH body for the wall row, or null when nothing about the wall
 * changed and the request should be skipped.
 */
export function wallPatchBody(
  snap: WallSaveSnapshot,
  lastSaved: WallSaveSnapshot,
): WallPatchBody | null {
  const dimsChanged =
    snap.width_cm !== lastSaved.width_cm || snap.height_cm !== lastSaved.height_cm;

  // Case-insensitive: the picker emits lower case and the DB stores upper,
  // so a strict compare would re-PATCH the same colour on every save.
  const colourChanged =
    snap.wall_color_hex !== null &&
    snap.wall_color_hex.toUpperCase() !== (lastSaved.wall_color_hex ?? "").toUpperCase();

  if (!dimsChanged && !colourChanged) return null;

  return {
    width_cm: snap.width_cm,
    height_cm: snap.height_cm,
    ...(colourChanged ? { wall_color_hex: snap.wall_color_hex as string } : {}),
  };
}
