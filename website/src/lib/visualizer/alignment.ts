/**
 * Alignment guides for the editor.
 *
 * As the user drags an item, we look for nearby snap targets, the wall's
 * edges/centre/thirds and other items' edges/centres, and snap the
 * dragged item to the closest one within a pixel threshold. The same
 * function returns the lines to render as visual guides.
 *
 * Coordinate system:
 *   This module is pixel-only. Conversion to/from cm happens at the
 *   canvas boundary. All inputs/outputs use stage pixel coordinates,
 *   so callers can pass the dragged item's current px bounds and the
 *   wall/items in the same space.
 */

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  /** Adjusted top-left position after snapping (may equal input). */
  x: number;
  y: number;
  /** Vertical guide x-coords to draw. */
  verticalGuides: number[];
  /** Horizontal guide y-coords to draw. */
  horizontalGuides: number[];
}

/** Snap threshold in stage pixels. ~5px feels firm without being sticky. */
export const SNAP_THRESHOLD_PX = 5;

/**
 * For an axis (X or Y), candidate "lines" the dragged item can snap to.
 * Each is an absolute coord plus the kind of edge it represents on the
 * dragged item (start/centre/end). When two compatible kinds align (e.g.
 * dragged.start vs target.start) we snap.
 */
interface AxisTargets {
  /** Lines (absolute pixel coords on the stage). */
  lines: number[];
}

interface DraggedAxisEdges {
  start: number;   // left or top edge
  centre: number;  // centre x or centre y
  end: number;     // right or bottom edge
}

function edgesFor(rect: PxRect, axis: "x" | "y"): DraggedAxisEdges {
  if (axis === "x") {
    return {
      start: rect.x,
      centre: rect.x + rect.width / 2,
      end: rect.x + rect.width,
    };
  }
  return {
    start: rect.y,
    centre: rect.y + rect.height / 2,
    end: rect.y + rect.height,
  };
}

function snapAxis(
  edges: DraggedAxisEdges,
  targets: AxisTargets,
  threshold: number,
): { delta: number; matchedLines: number[] } {
  let bestDelta = 0;
  let bestDistance = threshold + 1;
  const matched: number[] = [];

  for (const t of targets.lines) {
    for (const e of [edges.start, edges.centre, edges.end]) {
      const distance = Math.abs(e - t);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestDelta = t - e;
      }
    }
  }

  // After picking the best snap delta, walk the lines once more and mark
  // every target the dragged edges land on after snapping, that's what
  // we draw as guides (multiple guides can light up at once).
  if (bestDistance <= threshold) {
    const adjustedEdges = {
      start: edges.start + bestDelta,
      centre: edges.centre + bestDelta,
      end: edges.end + bestDelta,
    };
    for (const t of targets.lines) {
      for (const e of [adjustedEdges.start, adjustedEdges.centre, adjustedEdges.end]) {
        if (Math.abs(e - t) < 0.5) {
          matched.push(t);
          break;
        }
      }
    }
  }

  return { delta: bestDelta, matchedLines: matched };
}

/**
 * Compute snap-adjusted position + guide lines for a dragged item.
 *
 * @param dragged Current pixel rect of the item being dragged.
 * @param wall Wall pixel rect (origin + size).
 * @param others Other items on the wall (pixel rects). The dragged item
 *               must NOT appear in this list.
 * @param threshold Snap distance in pixels.
 */
export function snapAndGuide(
  dragged: PxRect,
  wall: PxRect,
  others: PxRect[],
  threshold = SNAP_THRESHOLD_PX,
): SnapResult {
  // Build axis-target sets.
  const xTargets: AxisTargets = {
    lines: [
      wall.x,
      wall.x + wall.width / 3,
      wall.x + wall.width / 2,
      wall.x + (wall.width * 2) / 3,
      wall.x + wall.width,
      ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]),
    ],
  };
  const yTargets: AxisTargets = {
    lines: [
      wall.y,
      wall.y + wall.height / 3,
      wall.y + wall.height / 2,
      wall.y + (wall.height * 2) / 3,
      wall.y + wall.height,
      ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]),
    ],
  };

  const xRes = snapAxis(edgesFor(dragged, "x"), xTargets, threshold);
  const yRes = snapAxis(edgesFor(dragged, "y"), yTargets, threshold);

  return {
    x: dragged.x + xRes.delta,
    y: dragged.y + yRes.delta,
    verticalGuides: xRes.matchedLines,
    horizontalGuides: yRes.matchedLines,
  };
}
