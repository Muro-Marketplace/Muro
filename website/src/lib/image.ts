/**
 * Client-side image resizing using Canvas API.
 * No external dependencies needed.
 */

const MAX_DIMENSION = 2000;
const DEFAULT_QUALITY = 0.85;

/**
 * Resize an image file if it exceeds maxDimension in either direction.
 * Returns a new Blob (WebP if supported, otherwise JPEG).
 *
 * Quality defaults to 0.85 (artwork thumbnails on cards). Pass 0.92+
 * for venue photos + wall reference uploads where the buyer is
 * judging the *space*, not the artwork, softer JPEG/WebP at the
 * default rate looks visibly cheap on the public venue profile.
 */
export async function resizeImage(
  file: File,
  maxDimension: number = MAX_DIMENSION,
  quality: number = DEFAULT_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // No resize needed
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }

      // Scale down maintaining aspect ratio
      if (width > height) {
        height = Math.round((height / width) * maxDimension);
        width = maxDimension;
      } else {
        width = Math.round((width / height) * maxDimension);
        height = maxDimension;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      // Opt into higher-quality scaling, default canvas smoothing
      // is browser-dependent but usually mid-tier and visibly soft on
      // photographs. The "high" preset matches what the upload
      // pipeline used to do via a separate sharp pass.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, fall back to JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // WebP not supported, try JPEG
            canvas.toBlob(
              (jpegBlob) => {
                resolve(jpegBlob || file);
              },
              "image/jpeg",
              quality,
            );
          }
        },
        "image/webp",
        quality,
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Get an optimised URL for a Supabase storage image.
 * On Free plan, just returns the URL as-is.
 * On Pro plan, could append ?width=X&quality=Y transform params.
 */
export function getOptimizedUrl(
  url: string,
  width?: number,
  quality?: number
): string {
  // On Supabase Free plan, no transforms available.
  // Just return the raw URL, Next.js Image component handles optimisation.
  return url;
}

export function getThumbnailUrl(url: string): string {
  return getOptimizedUrl(url, 400, 60);
}

export function getPreviewUrl(url: string): string {
  return getOptimizedUrl(url, 800, 75);
}
