// snapAndGuide is the heart of the alignment-guides feature. We test:
//   - no snap when nothing is in range
//   - snap to wall left edge
//   - snap to wall horizontal centre
//   - snap to wall thirds
//   - snap to another item's edge
//   - threshold is respected (just outside → no snap; just inside → snap)
//   - both axes can snap independently
//   - guide list reports every line the dragged edges land on

import { describe, expect, it } from "vitest";
import { SNAP_THRESHOLD_PX, snapAndGuide, type PxRect } from "./alignment";

const wall: PxRect = { x: 100, y: 100, width: 600, height: 400 };

describe("snapAndGuide, no snap", () => {
  it("returns the input when nothing is in range", () => {
    const dragged: PxRect = { x: 250, y: 280, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(250);
    expect(r.y).toBe(280);
    expect(r.verticalGuides).toEqual([]);
    expect(r.horizontalGuides).toEqual([]);
  });
});

describe("snapAndGuide, wall edges", () => {
  it("snaps left edge of dragged to wall left edge", () => {
    // Wall left = 100. Drag at 102 → within 5px threshold → snap to 100.
    const dragged: PxRect = { x: 102, y: 200, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(100);
    expect(r.verticalGuides).toContain(100);
  });

  it("snaps right edge of dragged to wall right edge", () => {
    // Wall right = 700. Right edge of dragged at 700 → snap.
    const dragged: PxRect = { x: 618, y: 200, width: 80, height: 60 }; // right=698
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x + 80).toBe(700);
  });

  it("snaps top edge to wall top", () => {
    const dragged: PxRect = { x: 300, y: 102, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.y).toBe(100);
    expect(r.horizontalGuides).toContain(100);
  });
});

describe("snapAndGuide, wall centre + thirds", () => {
  it("snaps centre to wall horizontal centre", () => {
    // Wall centre x = 100 + 600/2 = 400.
    // For the dragged centre to land on 400, x = 400 - 40 = 360.
    const dragged: PxRect = { x: 358, y: 200, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(360);
  });

  it("snaps to one-third line of the wall", () => {
    // Wall width = 600. Thirds at x = 100 + 200 = 300, x = 100 + 400 = 500.
    // Place dragged left edge at 302 → snap to 300.
    const dragged: PxRect = { x: 302, y: 200, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(300);
  });
});

describe("snapAndGuide, other items", () => {
  it("snaps left edge to another item's left edge", () => {
    const other: PxRect = { x: 400, y: 250, width: 100, height: 80 };
    const dragged: PxRect = { x: 403, y: 350, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, [other]);
    expect(r.x).toBe(400);
  });

  it("snaps centre to another item's centre", () => {
    // Other centre x = 400 + 50 = 450. Dragged centre at 450 → x = 410.
    const other: PxRect = { x: 400, y: 250, width: 100, height: 80 };
    const dragged: PxRect = { x: 408, y: 350, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, [other]);
    expect(r.x).toBe(410);
  });
});

describe("snapAndGuide, threshold boundaries", () => {
  it("snaps when distance equals threshold", () => {
    const dragged: PxRect = {
      x: 100 + SNAP_THRESHOLD_PX,
      y: 200,
      width: 80,
      height: 60,
    };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(100);
  });

  it("does NOT snap when distance is one beyond threshold", () => {
    const dragged: PxRect = {
      x: 100 + SNAP_THRESHOLD_PX + 1,
      y: 200,
      width: 80,
      height: 60,
    };
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x).toBe(100 + SNAP_THRESHOLD_PX + 1);
    expect(r.verticalGuides).toEqual([]);
  });
});

describe("snapAndGuide, independent axes", () => {
  it("can snap on X without snapping on Y", () => {
    // X: drag right edge to wall right (700). Y: middle of wall, no snap.
    const dragged: PxRect = { x: 618, y: 235, width: 80, height: 60 }; // y=235 → not near any line
    const r = snapAndGuide(dragged, wall, []);
    expect(r.x + 80).toBe(700);
    // y was 235; closest wall line is centre 300 (Δ65) and one-third 233 (Δ2)
    //, actually 233 IS within threshold 5px, so y snaps to 233.
    // Adjust: pick a clearly out-of-range y.
    const dragged2: PxRect = { x: 618, y: 220, width: 80, height: 60 }; // y=220, edges 220/250/280
    // wall y lines: 100, 233, 300, 367, 500. Nearest to 220 is 233 (Δ13), out.
    // Nearest to centre 250 is 233 (Δ17), out. Nearest to 280 is 300 (Δ20), out.
    const r2 = snapAndGuide(dragged2, wall, []);
    expect(r2.y).toBe(220); // unchanged
    expect(r2.x + 80).toBe(700); // x snapped
  });
});

describe("snapAndGuide, multiple guides at once", () => {
  it("reports every line the snapped edges land on", () => {
    // If we snap so that left edge = wall left AND another item's left
    // also = wall left, both guides appear.
    const aligned: PxRect = { x: 100, y: 200, width: 80, height: 60 };
    const dragged: PxRect = { x: 103, y: 350, width: 80, height: 60 };
    const r = snapAndGuide(dragged, wall, [aligned]);
    expect(r.x).toBe(100);
    expect(r.verticalGuides).toContain(100); // wall left
  });
});
