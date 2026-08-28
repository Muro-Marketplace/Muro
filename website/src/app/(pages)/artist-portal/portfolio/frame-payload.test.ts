// 05 E41-d. The frame-options payload must carry pricesBySize (per-size uplift
// overrides); the old inline map dropped it, wiping per-size frame pricing on save.

import { describe, expect, it } from "vitest";
import { buildFramePayload } from "./frame-payload";

describe("buildFramePayload (E41-d)", () => {
  it("carries pricesBySize through, not just label/priceUplift/imageUrl", () => {
    const out = buildFramePayload([
      { label: "Oak", priceUplift: 20, imageUrl: "u", pricesBySize: { Medium: 12, Large: 18 } },
    ]);
    expect(out).toEqual([
      { label: "Oak", priceUplift: 20, imageUrl: "u", pricesBySize: { Medium: 12, Large: 18 } },
    ]);
  });

  it("coerces a string priceUplift to a finite number (the API rejects strings)", () => {
    expect(buildFramePayload([{ label: "Oak", priceUplift: "15" }])[0].priceUplift).toBe(15);
    // Non-numeric strings fall back to 0 rather than NaN.
    expect(buildFramePayload([{ label: "Oak", priceUplift: "abc" }])[0].priceUplift).toBe(0);
  });

  it("leaves pricesBySize undefined when the frame has none (no phantom key)", () => {
    const out = buildFramePayload([{ label: "Oak", priceUplift: 10 }]);
    expect(out[0].pricesBySize).toBeUndefined();
  });

  it("returns [] for undefined frameOptions", () => {
    expect(buildFramePayload(undefined)).toEqual([]);
  });
});
