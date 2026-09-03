// @vitest-environment jsdom
//
// Preview is a capture of the editor stage, so the shift the owner saw
// (art lined up to a photo rail, then nudged by the server compositor)
// cannot happen. These cover the maths and the hide/restore choreography
// against structural fakes; Konva and three.js need a real GPU canvas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_BACKGROUND,
  CAPTURE_MAX_PIXEL_RATIO,
  CaptureError,
  EDITOR_CHROME_SELECTORS,
  TAINTED_MESSAGE,
  UNSUPPORTED_3D_MESSAGE,
  canvasToBlob,
  captureErrorMessage,
  capturePixelRatio,
  captureRegion,
  captureScene,
  captureStage,
  isTaintedCanvasError,
  toCaptureError,
  withEditorChromeHidden,
  withOpaqueBackground,
  withSceneChromeHidden,
  CAPTURE_TARGET_LONG_EDGE_PX,
  CAPTURE_QUALITY,
  encodeWithinBudget,
  CAPTURE_QUALITY_STEPS,
  CAPTURE_MAX_BYTES,
  CAPTURE_MAX_DOWNSCALES,
} from "./capture";

// jsdom has no canvas backend: getContext() returns null and toBlob() is
// "not implemented". Stub both on the prototype so the helpers run.
type ToBlobImpl = (
  cb: (blob: Blob | null) => void,
  type?: string,
  quality?: number,
) => void;

let toBlobImpl: ToBlobImpl;
const fillRect = vi.fn();
const drawImage = vi.fn();
let fillStyleSeen: unknown;

beforeEach(() => {
  fillRect.mockReset();
  drawImage.mockReset();
  fillStyleSeen = undefined;
  toBlobImpl = (cb, type) => cb(new Blob(["x"], { type: type ?? "image/png" }));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    toBlobImpl(cb, type, typeof quality === "number" ? quality : undefined);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    const ctx = {
      fillRect,
      drawImage,
      set fillStyle(v: unknown) {
        fillStyleSeen = v;
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function securityError(): Error {
  const err = new Error("The operation is insecure.");
  err.name = "SecurityError";
  return err;
}

describe("capturePixelRatio", () => {
  it("scales the longer edge to the target", () => {
    expect(capturePixelRatio(800, 600)).toBeCloseTo(Math.min(CAPTURE_MAX_PIXEL_RATIO, CAPTURE_TARGET_LONG_EDGE_PX / 800));
    expect(capturePixelRatio(1200, 400)).toBeCloseTo(CAPTURE_TARGET_LONG_EDGE_PX / 1200);
  });

  it("caps at the maximum so phones don't allocate a huge bitmap", () => {
    expect(capturePixelRatio(300, 200)).toBe(CAPTURE_MAX_PIXEL_RATIO);
  });

  it("goes below 1 for a stage already wider than the target", () => {
    expect(capturePixelRatio(4800, 1000)).toBeCloseTo(CAPTURE_TARGET_LONG_EDGE_PX / 4800);
  });

  it("falls back to 1 for degenerate sizes", () => {
    expect(capturePixelRatio(0, 0)).toBe(1);
    expect(capturePixelRatio(Number.NaN, 10)).toBe(1);
  });

  it("honours overrides", () => {
    expect(capturePixelRatio(100, 100, { targetLongEdge: 1000, maxPixelRatio: 20 })).toBe(10);
  });
});

describe("captureRegion", () => {
  it("grows the wall by the margin on every side", () => {
    const region = captureRegion(
      { x: 100, y: 50, width: 400, height: 300 },
      { width: 1000, height: 800 },
      20,
    );
    expect(region).toEqual({ x: 80, y: 30, width: 440, height: 340 });
  });

  it("clamps to the stage bounds", () => {
    const region = captureRegion(
      { x: 5, y: 5, width: 990, height: 790 },
      { width: 1000, height: 800 },
      20,
    );
    expect(region).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it("snaps fractional edges outwards to whole pixels", () => {
    const region = captureRegion(
      { x: 10.4, y: 10.6, width: 100.2, height: 50.9 },
      { width: 1000, height: 800 },
      0,
    );
    expect(region).toEqual({ x: 10, y: 10, width: 101, height: 52 });
  });
});

describe("withOpaqueBackground", () => {
  it("fills with the editor background before drawing the stage", () => {
    const source = document.createElement("canvas");
    source.width = 120;
    source.height = 80;
    const out = withOpaqueBackground(source);
    expect(out.width).toBe(120);
    expect(out.height).toBe(80);
    expect(fillStyleSeen).toBe(CAPTURE_BACKGROUND);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 120, 80);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
    // Order matters: the fill must land under the image, not over it.
    expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      drawImage.mock.invocationCallOrder[0],
    );
  });

  it("throws a CaptureError when 2D canvas is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    const source = document.createElement("canvas");
    expect(() => withOpaqueBackground(source)).toThrowError(CaptureError);
  });
});

describe("canvasToBlob", () => {
  it("asks for WebP at the capture quality", async () => {
    const seen: Array<[string | undefined, number | undefined]> = [];
    toBlobImpl = (cb, type, quality) => {
      seen.push([type, quality]);
      cb(new Blob(["webp"], { type: "image/webp" }));
    };
    const blob = await canvasToBlob(document.createElement("canvas"));
    expect(blob.type).toBe("image/webp");
    expect(seen).toEqual([["image/webp", CAPTURE_QUALITY]]);
  });

  it("accepts the browser's own PNG fallback for an unsupported type", async () => {
    // Safari ignores an unsupported type and encodes PNG instead.
    toBlobImpl = (cb) => cb(new Blob(["png"], { type: "image/png" }));
    const blob = await canvasToBlob(document.createElement("canvas"));
    expect(blob.type).toBe("image/png");
  });

  it("retries as PNG when WebP yields nothing", async () => {
    const types: Array<string | undefined> = [];
    toBlobImpl = (cb, type) => {
      types.push(type);
      if (type === "image/webp") cb(null);
      else cb(new Blob(["png"], { type: "image/png" }));
    };
    const blob = await canvasToBlob(document.createElement("canvas"));
    expect(blob.type).toBe("image/png");
    expect(types).toEqual(["image/webp", "image/png"]);
  });

  it("rejects with an empty CaptureError when both encoders give up", async () => {
    toBlobImpl = (cb) => cb(null);
    await expect(canvasToBlob(document.createElement("canvas"))).rejects.toMatchObject({
      name: "CaptureError",
      reason: "empty",
    });
  });

  it("maps a tainted canvas to CaptureError('tainted')", async () => {
    toBlobImpl = () => {
      throw securityError();
    };
    await expect(canvasToBlob(document.createElement("canvas"))).rejects.toMatchObject({
      name: "CaptureError",
      reason: "tainted",
      message: TAINTED_MESSAGE,
    });
  });
});

describe("error classification", () => {
  it("recognises SecurityError by name, whatever the constructor", () => {
    expect(isTaintedCanvasError(securityError())).toBe(true);
    expect(isTaintedCanvasError(new CaptureError("tainted", "x"))).toBe(true);
    expect(isTaintedCanvasError(new Error("boom"))).toBe(false);
    expect(isTaintedCanvasError(null)).toBe(false);
  });

  it("wraps unknown failures as unsupported and keeps CaptureErrors as they are", () => {
    const original = new CaptureError("empty", "nothing");
    expect(toCaptureError(original)).toBe(original);
    expect(toCaptureError(new Error("gpu lost"))).toMatchObject({
      reason: "unsupported",
      message: "gpu lost",
    });
    expect(toCaptureError("???").reason).toBe("unsupported");
  });

  it("gives the user a specific line for a tainted image", () => {
    expect(captureErrorMessage(securityError())).toBe(TAINTED_MESSAGE);
    expect(captureErrorMessage(securityError(), "3d")).toBe(TAINTED_MESSAGE);
  });

  it("tells a 3D user to switch to 2D for any other failure", () => {
    expect(captureErrorMessage(new Error("no buffer"), "3d")).toBe(UNSUPPORTED_3D_MESSAGE);
  });

  it("passes a 2D failure's own message through", () => {
    expect(captureErrorMessage(new Error("gpu lost"))).toBe("gpu lost");
    expect(captureErrorMessage(undefined)).toBe("Preview failed unexpectedly.");
  });
});

// ── Konva stage ──────────────────────────────────────────────────────────

function fakeNode(visible = true) {
  const node = {
    _visible: visible,
    visible: () => node._visible,
    hide: vi.fn(() => {
      node._visible = false;
    }),
    show: vi.fn(() => {
      node._visible = true;
    }),
  };
  return node;
}

function fakeStage(nodes: Record<string, ReturnType<typeof fakeNode>[]>) {
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 10;
  return {
    canvas,
    find: vi.fn((selector: string) => nodes[selector] ?? []),
    toCanvas: vi.fn(() => canvas),
  };
}

describe("withEditorChromeHidden", () => {
  it("hides transformers and guide lines while the callback runs, then restores them", () => {
    const transformer = fakeNode();
    const guide = fakeNode();
    const alreadyHidden = fakeNode(false);
    const stage = fakeStage({
      Transformer: [transformer],
      ".editor-chrome": [guide, alreadyHidden],
    });

    const seenDuring: boolean[] = [];
    withEditorChromeHidden(stage, () => {
      seenDuring.push(transformer.visible(), guide.visible());
    });

    expect(seenDuring).toEqual([false, false]);
    expect(transformer.visible()).toBe(true);
    expect(guide.visible()).toBe(true);
    // A node that was hidden anyway must not be shown afterwards.
    expect(alreadyHidden.show).not.toHaveBeenCalled();
    expect(alreadyHidden.visible()).toBe(false);
    expect(stage.find.mock.calls.map((c) => c[0])).toEqual([...EDITOR_CHROME_SELECTORS]);
  });

  it("restores the chrome even when the callback throws", () => {
    const transformer = fakeNode();
    const stage = fakeStage({ Transformer: [transformer] });
    expect(() =>
      withEditorChromeHidden(stage, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(transformer.visible()).toBe(true);
  });
});

describe("captureStage", () => {
  it("crops to the region at the computed pixel ratio and returns an encoded blob", async () => {
    const stage = fakeStage({});
    const blob = await captureStage(stage, {
      region: { x: 40, y: 20, width: 800, height: 600 },
    });
    expect(blob.type).toBe("image/webp");
    expect(stage.toCanvas).toHaveBeenCalledWith({
      x: 40,
      y: 20,
      width: 800,
      height: 600,
      pixelRatio: Math.min(CAPTURE_MAX_PIXEL_RATIO, CAPTURE_TARGET_LONG_EDGE_PX / 800),
    });
    // The stage canvas was composited onto the opaque background.
    expect(fillStyleSeen).toBe(CAPTURE_BACKGROUND);
    expect(drawImage).toHaveBeenCalledWith(stage.canvas, 0, 0);
  });

  it("surfaces a tainted image as CaptureError('tainted') and still restores chrome", async () => {
    const transformer = fakeNode();
    const stage = fakeStage({ Transformer: [transformer] });
    toBlobImpl = () => {
      throw securityError();
    };
    await expect(
      captureStage(stage, { region: { x: 0, y: 0, width: 10, height: 10 } }),
    ).rejects.toMatchObject({ reason: "tainted" });
    expect(transformer.visible()).toBe(true);
  });

  it("wraps a toCanvas failure", async () => {
    const stage = fakeStage({});
    stage.toCanvas.mockImplementation(() => {
      throw new Error("out of memory");
    });
    await expect(
      captureStage(stage, { region: { x: 0, y: 0, width: 10, height: 10 } }),
    ).rejects.toMatchObject({ name: "CaptureError", message: "out of memory" });
  });
});

// ── three.js scene ───────────────────────────────────────────────────────

function fakeScene(objects: Array<{ visible: boolean; userData: Record<string, unknown> }>) {
  return {
    objects,
    traverse: (cb: (o: { visible: boolean; userData: Record<string, unknown> }) => void) => {
      for (const o of objects) cb(o);
    },
  };
}

describe("withSceneChromeHidden", () => {
  it("hides only objects flagged as editor chrome and restores them", () => {
    const outline = { visible: true, userData: { editorChrome: true } };
    const handle = { visible: true, userData: { editorChrome: true } };
    const artwork = { visible: true, userData: {} };
    const hiddenHandle = { visible: false, userData: { editorChrome: true } };
    const scene = fakeScene([outline, handle, artwork, hiddenHandle]);

    const during: boolean[] = [];
    withSceneChromeHidden(scene, () => {
      during.push(outline.visible, handle.visible, artwork.visible);
    });

    expect(during).toEqual([false, false, true]);
    expect(outline.visible).toBe(true);
    expect(handle.visible).toBe(true);
    expect(hiddenHandle.visible).toBe(false);
  });
});

describe("captureScene", () => {
  it("renders one chrome-free frame before reading the drawing buffer", async () => {
    const outline = { visible: true, userData: { editorChrome: true } };
    const scene = fakeScene([outline]);
    const camera = { isCamera: true };
    const visibleAtRender: boolean[] = [];
    const renderer = {
      domElement: document.createElement("canvas"),
      render: vi.fn((s: unknown, c: unknown) => {
        expect(s).toBe(scene);
        expect(c).toBe(camera);
        visibleAtRender.push(outline.visible);
      }),
    };
    toBlobImpl = (cb) => cb(new Blob(["frame"], { type: "image/webp" }));

    const blob = await captureScene(renderer, scene, camera);

    expect(blob.type).toBe("image/webp");
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(visibleAtRender).toEqual([false]);
    expect(outline.visible).toBe(true);
  });

  it("wraps a renderer failure as a CaptureError", async () => {
    const scene = fakeScene([]);
    const renderer = {
      domElement: document.createElement("canvas"),
      render: () => {
        throw new Error("context lost");
      },
    };
    await expect(captureScene(renderer, scene, {})).rejects.toMatchObject({
      name: "CaptureError",
      message: "context lost",
    });
  });
});

describe("encodeWithinBudget", () => {
  const mb = (n: number) => new Blob([new Uint8Array(Math.round(n * 1024 * 1024))], { type: "image/webp" });

  it("steps the quality down until the file fits the budget", async () => {
    const asked: number[] = [];
    toBlobImpl = (cb, _type, quality) => {
      asked.push(quality ?? -1);
      cb(quality !== undefined && quality <= 0.88 ? mb(3) : mb(6));
    };
    const blob = await encodeWithinBudget(document.createElement("canvas"));
    expect(blob.size).toBe(3 * 1024 * 1024);
    expect(asked).toEqual([0.95, 0.92, 0.88]);
  });

  it("returns the first result when it already fits", async () => {
    const asked: number[] = [];
    toBlobImpl = (cb, _type, quality) => {
      asked.push(quality ?? -1);
      cb(mb(1));
    };
    await encodeWithinBudget(document.createElement("canvas"));
    expect(asked).toEqual([CAPTURE_QUALITY_STEPS[0]]);
  });

  it("hands back the smallest result when nothing fits even after scaling down", async () => {
    let calls = 0;
    toBlobImpl = (cb, _type, quality) => {
      calls += 1;
      cb(mb(quality === 0.8 ? 5 : 7));
    };
    const blob = await encodeWithinBudget(document.createElement("canvas"), { budgetBytes: CAPTURE_MAX_BYTES });
    // Every quality step on the original and on each of the smaller bitmaps.
    expect(calls).toBe(CAPTURE_QUALITY_STEPS.length * (CAPTURE_MAX_DOWNSCALES + 1));
    expect(blob.size).toBe(5 * 1024 * 1024);
  });

  it("goes straight to scaling when the browser only encodes PNG", async () => {
    let calls = 0;
    toBlobImpl = (cb) => {
      calls += 1;
      cb(new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" }));
    };
    await encodeWithinBudget(document.createElement("canvas"));
    // One PNG per bitmap size: no quality steps, only the downscale rounds.
    expect(calls).toBe(CAPTURE_MAX_DOWNSCALES + 1);
  });
});
