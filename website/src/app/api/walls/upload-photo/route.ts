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
 *
 * Tier cap (H28):
 *   Every tier advertises a `wall_uploads_daily` figure in tier-limits.ts
 *   (customer 1, artist_core 1, artist_premium 3, pro / venue_premium 5) and
 *   quota.ts burst-lists the `wall_upload` action, but this route consulted
 *   neither, so the only ceiling that ever applied was the 15MB size cap.
 *   Uploads are now metered against that figure, plus the same per-user
 *   hourly burst limit the render paths use.
 *
 *   Why not `consumeQuota()`: its daily/monthly checks are the RENDER budget
 *   (`limits.daily`), and `sumUsage` totals every action in the day bucket,
 *   so charging an upload there would silently eat a render. Uploads have
 *   their own allowance, so they are ledgered as zero-cost `wall_upload`
 *   rows (free against the render budget, visible in the audit trail) and
 *   counted by row instead. The row is written only after the storage write
 *   succeeds, which is what refunding-on-failure achieves elsewhere: a photo
 *   that never landed never costs the user an upload.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dayBucketUTC, monthBucketUTC, nextDailyResetUTC } from "@/lib/visualizer/quota";
import { getTierLimits } from "@/lib/visualizer/tier-limits";
import { resolveTier } from "@/lib/visualizer/tier-resolver";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "wall-photos";

// Mirrors the render burst rule in quota.ts: a single account can't burn a
// whole day's allowance in thirty seconds even where the tier permits it.
// Its own bucket, so uploading never eats a render's burst headroom.
const UPLOAD_BURST = { name: "wall_upload_burst", limit: 30, windowSeconds: 3600 };

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

/**
 * How many wall photos this user has already uploaded today. Counts rows
 * rather than summing `cost_units`, because upload rows are deliberately
 * zero-cost (see the header note). A failed read counts as "at the cap":
 * an unmetered upload path is exactly the hole this closes, so fail closed.
 */
async function countUploadsToday(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  dayBucket: string,
): Promise<number> {
  try {
    const { count, error } = await db
      .from("visualizer_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "wall_upload")
      .eq("day_bucket", dayBucket);
    if (error) {
      console.error("[upload-photo] usage count failed:", error.message);
      return Number.MAX_SAFE_INTEGER;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[upload-photo] usage count threw:", err);
    return Number.MAX_SAFE_INTEGER;
  }
}

export async function POST(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  // ── Tier cap on uploads (H28) ─────────────────────────────────────────
  const tier = await resolveTier({ userId });
  const uploadsCap = getTierLimits(tier).wall_uploads_daily;
  if (uploadsCap === 0) {
    return NextResponse.json(
      {
        error: "Uploading your own wall photo isn't included on your plan.",
        reason: "wall_uploads_not_allowed",
        tier,
      },
      { status: 402 },
    );
  }

  const burst = await withRateLimit(request, { ...UPLOAD_BURST, key: userId });
  if (burst) return burst;

  const now = new Date();
  const dayBucket = dayBucketUTC(now);
  const db = getSupabaseAdmin();

  // -1 is the unlimited sentinel, same convention as the render limits.
  if (uploadsCap > 0) {
    const usedToday = await countUploadsToday(db, userId, dayBucket);
    if (usedToday >= uploadsCap) {
      return NextResponse.json(
        {
          error: `You've used all ${uploadsCap} wall photo upload${uploadsCap === 1 ? "" : "s"} on your plan today.`,
          reason: "wall_uploads_daily",
          tier,
          cap: uploadsCap,
          resets_at: nextDailyResetUTC(now).toISOString(),
        },
        { status: 429 },
      );
    }
  }

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

  // The photo is stored, so charge the allowance. Zero cost units: this
  // action has its own daily cap and must not draw down the render budget
  // that sumUsage() computes from the same day bucket.
  const { error: ledgerErr } = await db.from("visualizer_usage").insert({
    user_id: userId,
    action: "wall_upload",
    cost_units: 0,
    day_bucket: dayBucket,
    month_bucket: monthBucketUTC(now),
    reference_id: objectId,
    metadata: { path, bytes: file.size, mime },
  });
  if (ledgerErr) {
    // The photo exists and the caller needs its path, so don't fail here.
    // Worst case the user gets one uncounted upload; the burst limiter still
    // holds the ceiling.
    console.error("[upload-photo] failed to record upload usage:", ledgerErr.message);
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
