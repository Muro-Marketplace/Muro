import { describe, expect, it } from "vitest";
import {
  PREVIEW_CONTENT_TYPES,
  PREVIEW_MAX_BYTES,
  previewFileName,
  previewFormatFromType,
  sniffPreviewImage,
} from "./preview-image";

const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe("sniffPreviewImage", () => {
  it("recognises WebP by RIFF....WEBP", () => {
    expect(sniffPreviewImage(WEBP_BYTES)).toBe("webp");
  });

  it("recognises PNG by its eight-byte signature", () => {
    expect(sniffPreviewImage(PNG_BYTES)).toBe("png");
  });

  it("refuses a RIFF container that is not WebP (a WAV file)", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    ]);
    expect(sniffPreviewImage(wav)).toBeNull();
  });

  it("refuses JPEG, SVG, HTML and empty input regardless of any declared type", () => {
    expect(sniffPreviewImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(sniffPreviewImage(new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).toBeNull();
    expect(sniffPreviewImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffPreviewImage(new Uint8Array([]))).toBeNull();
  });

  it("does not read past the end of a truncated header", () => {
    expect(sniffPreviewImage(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
    expect(sniffPreviewImage(PNG_BYTES.slice(0, 7))).toBeNull();
  });
});

describe("naming", () => {
  it("names the upload by its format", () => {
    expect(previewFileName("webp")).toBe("wall-preview.webp");
    expect(previewFileName("png")).toBe("wall-preview.png");
  });

  it("treats anything but PNG as WebP, the capture default", () => {
    expect(previewFormatFromType("image/png")).toBe("png");
    expect(previewFormatFromType("IMAGE/PNG")).toBe("png");
    expect(previewFormatFromType("image/webp")).toBe("webp");
    expect(previewFormatFromType("")).toBe("webp");
    expect(previewFormatFromType(undefined)).toBe("webp");
  });

  it("maps formats to the content types the storage bucket is told", () => {
    expect(PREVIEW_CONTENT_TYPES.webp).toBe("image/webp");
    expect(PREVIEW_CONTENT_TYPES.png).toBe("image/png");
  });

  it("caps uploads at 8 MB", () => {
    expect(PREVIEW_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});
