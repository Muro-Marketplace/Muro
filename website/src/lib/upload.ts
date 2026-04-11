import { supabase } from "./supabase";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Upload an image to Supabase Storage and return the public URL.
 * Validates file size and MIME type before uploading.
 * Throws on failure — callers should handle errors.
 */
export async function uploadImage(
  file: File,
  bucket: "avatars" | "artworks"
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

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
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
