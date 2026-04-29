/**
 * /api/walls/upload-photo
 *
 * POST, accept an image file (multipart/form-data), validate, store
 * it in the private `wall-photos` Supabase Storage bucket, and return
 * the storage path + a short-lived signed URL the client can preview.
 *
 * Why server-side (vs direct supabase-js client upload)?
 *   - The bucket is private and the user shouldn't need write RLS on
 *     storage.objects to make this work.
 *   - We get to validate file size + MIME centrally.
 *   - Future cropping / EXIF stripping / dimension auto-detect can
 *     happen here without client changes.
 *
 * Storage layout:
 *   wall-photos/{user_id}/{uuid}.{ext}
 *   The path is keyed by user_id so deletion + per-user listing is easy.
 *
 * Returns:
 *   { path: "u-real/abcd….jpg", signedUrl: "https://…?token=…" }
 *
 * Caller flow:
 *   1. POST a single file as `file` in multipart form-data → get back
 *      { path }.
 *   2. POST /api/walls with { kind: "uploaded", source_image_path: path,
 *      width_cm, height_cm, name, owner_type }.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "wall-photos";

// 15 MB cap matches what most modern phones produce; bigger photos
// don't render meaningfully better at 1600×1200.
const MAX_BYTES = 15 * 1024 * 1024;

// Supported MIME → file extension. We rewrite uploads to .jpg/.png/.webp
// so the path is predictable and the renderer doesn't have to sniff.
const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  // Parse multipart body.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof Blob) || !(file as File).name) {
    return NextResponse.json(
      { error: "Missing 'file' part" },
      { status: 400 },
    );
  }

  // Validate.
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
      },
      { status: 413 },
    );
  }
  const mime = file.type.toLowerCase();
  const ext = ACCEPTED[mime];
  if (!ext) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Use JPG, PNG, or WebP.",
        receivedType: mime || "(unknown)",
      },
      { status: 400 },
    );
  }

  // Read bytes into a Buffer for sharp-friendly upload.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Storage path: {user_id}/{uuid}.{ext}
  const objectId = randomUUID();
  const path = `${userId}/${objectId}.${ext}`;

  const db = getSupabaseAdmin();

  const { error: uploadErr } = await db.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      cacheControl: "604800", // 7 days (photo isn't going to change)
      upsert: false,
    });
  if (uploadErr) {
    console.error("[upload-photo] storage upload failed:", uploadErr.message);
    return NextResponse.json(
      {
        error:
          "Could not save the photo. Make sure the 'wall-photos' Storage bucket exists in Supabase.",
        detail: uploadErr.message,
      },
      { status: 500 },
    );
  }

  // Short-lived signed URL so the client can immediately preview the
  // photo in the create-wall form. 1 hour is plenty for the form flow.
  const { data: signed, error: signErr } = await db.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signErr || !signed?.signedUrl) {
    console.error(
      "[upload-photo] createSignedUrl failed:",
      signErr?.message,
    );
    // Don't fail the whole request, caller can still create the wall
    // and re-fetch the URL on the editor page.
    return NextResponse.json({ path, signedUrl: null }, { status: 200 });
  }

  return NextResponse.json({ path, signedUrl: signed.signedUrl });
}
