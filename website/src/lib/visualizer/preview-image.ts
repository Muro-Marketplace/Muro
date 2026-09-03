/**
 * Shared rules for a client-captured wall preview image.
 *
 * Used on both sides of POST /api/walls/[id]/layouts/[lid]/preview: the
 * editor names the file it uploads with `previewFileName`, the route
 * sniffs the bytes with `sniffPreviewImage` and refuses anything that is
 * not the WebP or PNG a canvas export produces. The declared content type
 * is a hint at best (a browser can be told to send anything), so the
 * magic bytes are what count.
 */

export const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

export type PreviewImageFormat = "webp" | "png";

export const PREVIEW_CONTENT_TYPES: Record<PreviewImageFormat, "image/webp" | "image/png"> = {
  webp: "image/webp",
  png: "image/png",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** Format of an image by its magic bytes, or null when it is neither. */
export function sniffPreviewImage(bytes: Uint8Array): PreviewImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  // RIFF....WEBP: bytes 0-3 "RIFF", 4-7 file size, 8-11 "WEBP".
  const RIFF = [0x52, 0x49, 0x46, 0x46];
  const WEBP = [0x57, 0x45, 0x42, 0x50];
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp";
  return null;
}

/** Format implied by a Blob's declared type, for naming the upload. */
export function previewFormatFromType(type: string | null | undefined): PreviewImageFormat {
  return type?.toLowerCase() === "image/png" ? "png" : "webp";
}

export function previewFileName(format: PreviewImageFormat): string {
  return `wall-preview.${format}`;
}
