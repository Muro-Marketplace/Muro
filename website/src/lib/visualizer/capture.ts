/**
 * Editor capture helpers.
 *
 * Preview is a pixel capture of the editor stage, not a server
 * re-composite. The sharp compositor (render-service.ts) recomputed its
 * own scale on a fixed canvas and cover-cropped the wall photo, so art
 * lined up against a photo rail in the editor landed somewhere else in
 * the render. Capturing the stage the user is looking at is the only way
 * the preview is guaranteed to match the editor.
 *
 * Konva `stage.toCanvas()` re-renders the node tree onto a fresh canvas at
 * the requested pixel ratio, so the capture can be sharper than the screen
 * and nodes hidden for the duration (selection handles, alignment guides)
 * are simply skipped. The on-screen layer is never redrawn, so there is no
 * flicker.
 *
 * Everything here is written against structural types (a stage that can
 * `find` and `toCanvas`, a scene that can `traverse`) so the maths and the
 * hide/restore choreography are unit-testable without Konva or three.js.
 */

/** Longer edge of the capture, in device pixels. */
export const CAPTURE_TARGET_LONG_EDGE_PX = 3200;
/** Never ask Konva for more than this, memory on phones is the limit. */
export const CAPTURE_MAX_PIXEL_RATIO = 4;
export const CAPTURE_MIME = "image/webp";
export const CAPTURE_QUALITY = 0.92;
/**
 * Colour behind the wall in the editor (Tailwind stone-100). The stage
 * itself is transparent outside the wall rect, so the capture is filled
 * with this before encoding to read exactly like the editor.
 */
export const CAPTURE_BACKGROUND = "#F5F5F4";
/** Breathing room kept around the wall so its drop shadow survives the crop. */
export const CAPTURE_MARGIN_PX = 32;

/** Konva name given to guide lines and similar editor-only nodes. */
export const EDITOR_CHROME_NAME = "editor-chrome";
/**
 * Konva selectors for nodes that are editor chrome rather than wall
 * content. Transformers (selection + hover handles) are matched by class,
 * everything else opts in with the `editor-chrome` name.
 */
export const EDITOR_CHROME_SELECTORS = ["Transformer", `.${EDITOR_CHROME_NAME}`] as const;

export type CaptureFailure = "tainted" | "unsupported" | "empty";

export class CaptureError extends Error {
  readonly reason: CaptureFailure;

  constructor(reason: CaptureFailure, message: string) {
    super(message);
    this.name = "CaptureError";
    this.reason = reason;
    Object.setPrototypeOf(this, CaptureError.prototype);
  }
}

export const TAINTED_MESSAGE =
  "This artwork's image can't be previewed. Its host doesn't allow it to be copied into a preview.";
export const UNSUPPORTED_3D_MESSAGE =
  "The 3D view couldn't be captured. Switch to 2D to preview this wall.";
const GENERIC_MESSAGE = "Preview failed unexpectedly.";

/** True for the browser's tainted-canvas refusal, in any of its shapes. */
export function isTaintedCanvasError(err: unknown): boolean {
  if (err instanceof CaptureError) return err.reason === "tainted";
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === "SecurityError";
}

/** Normalise whatever a capture threw into a CaptureError. */
export function toCaptureError(err: unknown): CaptureError {
  if (err instanceof CaptureError) return err;
  if (isTaintedCanvasError(err)) return new CaptureError("tainted", TAINTED_MESSAGE);
  const message = err instanceof Error && err.message ? err.message : GENERIC_MESSAGE;
  return new CaptureError("unsupported", message);
}

/** The line to show the user for a failed capture. */
export function captureErrorMessage(err: unknown, view: "2d" | "3d" = "2d"): string {
  const normalised = toCaptureError(err);
  if (normalised.reason === "tainted") return TAINTED_MESSAGE;
  if (view === "3d") return UNSUPPORTED_3D_MESSAGE;
  return normalised.message || GENERIC_MESSAGE;
}

/**
 * Pixel ratio that puts the longer edge of a `width` x `height` region at
 * about the target size, capped so a phone never has to allocate a huge
 * bitmap. Degenerate sizes fall back to 1.
 */
export function capturePixelRatio(
  width: number,
  height: number,
  opts: { targetLongEdge?: number; maxPixelRatio?: number } = {},
): number {
  const target = opts.targetLongEdge ?? CAPTURE_TARGET_LONG_EDGE_PX;
  const max = opts.maxPixelRatio ?? CAPTURE_MAX_PIXEL_RATIO;
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) return 1;
  const ratio = target / longEdge;
  return Math.min(max, Math.max(0.25, ratio));
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The wall rect grown by `margin` on every side, clamped to the stage so
 * Konva never draws outside its own canvas. Integer edges so the crop has
 * no half-pixel seam.
 */
export function captureRegion(
  wall: CaptureRegion,
  stage: { width: number; height: number },
  margin: number = CAPTURE_MARGIN_PX,
): CaptureRegion {
  const x0 = Math.max(0, Math.floor(wall.x - margin));
  const y0 = Math.max(0, Math.floor(wall.y - margin));
  const x1 = Math.min(stage.width, Math.ceil(wall.x + wall.width + margin));
  const y1 = Math.min(stage.height, Math.ceil(wall.y + wall.height + margin));
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  };
}

/**
 * Copy `source` onto a fresh, opaque canvas of the same size. The stage's
 * own canvas is transparent wherever nothing was drawn.
 */
export function withOpaqueBackground(
  source: HTMLCanvasElement,
  background: string = CAPTURE_BACKGROUND,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) {
    throw new CaptureError("unsupported", "Canvas isn't available in this browser.");
  }
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  return out;
}

/**
 * Encode a canvas. WebP at CAPTURE_QUALITY; a browser that can't encode
 * WebP hands back PNG (the spec's own fallback), and a null result is
 * retried as PNG before giving up. A tainted canvas throws synchronously
 * from `toBlob`, which is where a cross-origin image surfaces.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  opts: { type?: string; quality?: number } = {},
): Promise<Blob> {
  const type = opts.type ?? CAPTURE_MIME;
  const quality = opts.quality ?? CAPTURE_QUALITY;

  return new Promise<Blob>((resolve, reject) => {
    const attempt = (mime: string, q: number | undefined, fallback: (() => void) | null) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else if (fallback) {
              fallback();
            } else {
              reject(new CaptureError("empty", "The preview came back empty."));
            }
          },
          mime,
          q,
        );
      } catch (err) {
        reject(toCaptureError(err));
      }
    };
    const pngFallback = type === "image/png" ? null : () => attempt("image/png", undefined, null);
    attempt(type, quality, pngFallback);
  });
}

// ── Konva stage capture ─────────────────────────────────────────────────

interface HideableNode {
  visible(): boolean;
  hide(): void;
  show(): void;
}

/** The slice of Konva.Stage the capture needs. */
export interface CaptureStage {
  find(selector: string): ArrayLike<HideableNode>;
  toCanvas(config: CaptureRegion & { pixelRatio: number }): HTMLCanvasElement;
}

/**
 * Hide every chrome node, run `fn`, restore the ones that were visible.
 * Restores even when `fn` throws. Konva's `toCanvas` re-renders from the
 * node tree, so hiding without a redraw is enough: the screen keeps
 * showing the handles, the capture leaves them out.
 */
export function withEditorChromeHidden<T>(stage: CaptureStage, fn: () => T): T {
  const hidden: HideableNode[] = [];
  for (const selector of EDITOR_CHROME_SELECTORS) {
    for (const node of Array.from(stage.find(selector))) {
      if (node.visible()) {
        node.hide();
        hidden.push(node);
      }
    }
  }
  try {
    return fn();
  } finally {
    for (const node of hidden) node.show();
  }
}

export interface CaptureStageOptions {
  /** Stage-pixel region to capture, usually `captureRegion(wallRect, stageSize)`. */
  region: CaptureRegion;
  background?: string;
  targetLongEdge?: number;
  maxPixelRatio?: number;
}

/**
 * Capture a Konva stage region as an encoded image. Chrome is hidden for
 * the duration, the region is filled behind with the editor background,
 * and cross-origin images surface as a CaptureError("tainted").
 */
export async function captureStage(
  stage: CaptureStage,
  opts: CaptureStageOptions,
): Promise<Blob> {
  const pixelRatio = capturePixelRatio(opts.region.width, opts.region.height, {
    targetLongEdge: opts.targetLongEdge,
    maxPixelRatio: opts.maxPixelRatio,
  });
  let raw: HTMLCanvasElement;
  try {
    raw = withEditorChromeHidden(stage, () =>
      stage.toCanvas({ ...opts.region, pixelRatio }),
    );
  } catch (err) {
    throw toCaptureError(err);
  }
  const opaque = withOpaqueBackground(raw, opts.background);
  return canvasToBlob(opaque);
}

// ── three.js scene capture ──────────────────────────────────────────────

/** The slice of THREE.Object3D the capture needs. */
export interface ChromeObject {
  visible: boolean;
  userData: Record<string, unknown>;
}

export interface CaptureScene {
  traverse(callback: (object: ChromeObject) => void): void;
}

export interface CaptureRenderer {
  render(scene: CaptureScene, camera: unknown): void;
  domElement: HTMLCanvasElement;
}

/** Marker put on `userData` of 3D objects that are editor chrome. */
export const EDITOR_CHROME_USER_DATA = { editorChrome: true } as const;

/**
 * Hide every object flagged `userData.editorChrome`, run `fn`, restore.
 * Same contract as the Konva version.
 */
export function withSceneChromeHidden<T>(scene: CaptureScene, fn: () => T): T {
  const hidden: ChromeObject[] = [];
  scene.traverse((object) => {
    if (object.visible && object.userData?.editorChrome === true) {
      object.visible = false;
      hidden.push(object);
    }
  });
  try {
    return fn();
  } finally {
    for (const object of hidden) object.visible = true;
  }
}

/**
 * Capture a WebGL scene. Forces one fresh frame without the chrome, then
 * reads the drawing buffer (the renderer must have been created with
 * `preserveDrawingBuffer: true`, or the buffer is blank by the time
 * `toBlob` reads it). Best effort: resolution is whatever the canvas is.
 */
export async function captureScene(
  renderer: CaptureRenderer,
  scene: CaptureScene,
  camera: unknown,
): Promise<Blob> {
  try {
    withSceneChromeHidden(scene, () => renderer.render(scene, camera));
  } catch (err) {
    throw toCaptureError(err);
  }
  return canvasToBlob(renderer.domElement);
}
