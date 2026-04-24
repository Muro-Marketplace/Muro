import { supabase } from "./supabase";
import { resizeImage } from "./image";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Contracts: PDFs and common Office formats so a venue/artist can upload
// the signed agreement and have it travel with the placement record.
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

/** Stored contract reference. The value lives in `placement_records.contract_attachment_url`:
 *    - Legacy rows: absolute `https://…supabase.co/storage/v1/object/public/contracts/<path>` URL
 *    - New rows: opaque reference of the form `contract:<bucket>/<path>` so the reader
 *      knows to sign it before displaying.
 *  The reader calls `POST /api/contracts/sign` to exchange the reference for a
 *  short-lived signed URL. Anyone holding only the reference (or the URL on an
 *  old row) still needs to be a party to the placement to read it. */
export const CONTRACT_REF_PREFIX = "contract:";

/**
 * Upload a contract / document file (PDF, Word, or scanned image) and
 * return an opaque reference, not a public URL. The `contracts` bucket
 * MUST be private (set in the Supabase dashboard) — if it's public,
 * the returned reference is still safe but the fallback URL would be
 * readable by anyone. See docs/security/AUDIT.md §G.
 */
export async function uploadContract(file: File): Promise<string> {
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    throw new Error("Allowed contract formats: PDF, Word, JPEG, PNG.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`);
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to upload contracts.");

  const ext = file.name.split(".").pop() || "pdf";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName || `contract.${ext}`}`;

  // Prefer the private `contracts` bucket. Fall back to `collections`
  // (legacy) only if `contracts` doesn't exist — which would mean the
  // deployment hasn't been set up yet and the caller should paste a link
  // instead.
  for (const bucket of ["contracts", "collections"] as const) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: "86400", upsert: false, contentType: file.type });
    if (!error) {
      // Opaque reference. The reader will call `/api/contracts/sign` to
      // exchange this for a short-lived signed URL after checking party
      // permissions. Never return a raw public URL here.
      return `${CONTRACT_REF_PREFIX}${bucket}/${path}`;
    }
    // Only fall through on missing-bucket — propagate other errors.
    if (!String(error.message || "").toLowerCase().includes("not found")) {
      console.error("Contract upload error:", error);
      throw new Error("Contract upload failed. Please try again.");
    }
  }
  throw new Error("Contract storage is not configured yet. Please paste a link instead.");
}

/** Detect whether a stored value is a post-Phase-0 contract reference. */
export function isContractRef(value: string | null | undefined): boolean {
  return !!value && value.startsWith(CONTRACT_REF_PREFIX);
}

/** Split a reference back into (bucket, path). */
export function parseContractRef(ref: string): { bucket: string; path: string } | null {
  if (!ref.startsWith(CONTRACT_REF_PREFIX)) return null;
  const body = ref.slice(CONTRACT_REF_PREFIX.length);
  const slash = body.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: body.slice(0, slash), path: body.slice(slash + 1) };
}

/**
 * Upload an image to Supabase Storage and return the public URL.
 * Validates file size and MIME type, resizes large images before uploading.
 * Throws on failure — callers should handle errors.
 */
export async function uploadImage(
  file: File,
  bucket: "avatars" | "artworks" | "collections"
): Promise<string> {
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF`);
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to upload images.");
  }

  // Resize large images before upload (max 2000px, converts to WebP if supported)
  let uploadBlob: Blob = file;
  try {
    const maxDim = bucket === "avatars" ? 800 : bucket === "collections" ? 1800 : 2000;
    uploadBlob = await resizeImage(file, maxDim);
  } catch {
    // If resize fails, upload original
    uploadBlob = file;
  }

  // Determine extension from resulting blob type
  const mimeToExt: Record<string, string> = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
  };
  const ext = mimeToExt[uploadBlob.type] || file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, uploadBlob, {
      cacheControl: "86400",
      upsert: false,
      contentType: uploadBlob.type || file.type,
    });

  if (error) {
    console.error("Upload error:", error);
    throw new Error("Image upload failed. Please try again.");
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return urlData.publicUrl;
}
