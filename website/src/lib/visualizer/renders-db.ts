/**
 * Render persistence, insert into wall_renders + upload to Storage.
 *
 * Storage layout:
 *   wall-renders/{user_id}/{render_id}.webp
 *
 *   The bucket should be publicly readable (set in the Supabase dashboard)
 *   so the resulting URL works in <img> tags + emails without a signed
 *   URL refresh. Customer-private uploads (wall-photos) live in a
 *   separate bucket and are signed-URL only.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { RenderKind, WallRender } from "./types";

const RENDERS_BUCKET = "wall-renders";

export interface PersistRenderInput {
  userId: string;
  layoutId: string | null;
  kind: RenderKind;
  layoutHash: string;
  costUnits: number;
  imageBuffer: Buffer;
  /** Optional provider tag (null for the MVP non-AI compositor). */
  provider?: string | null;
  /** Optional prompt seed when AI provider used. */
  promptSeed?: Record<string, unknown> | null;
}

export interface PersistRenderResult {
  render: WallRender;
  /** Public URL the client can fetch immediately. */
  publicUrl: string;
}

/**
 * Upload the render bytes to Supabase Storage, then insert a wall_renders
 * row. Returns the persisted record + its public URL. On any failure,
 * the inserted Storage object is left in place, that's cheap to rewrite
 * (next call replaces) and avoids leaving orphan DB rows.
 */
export async function persistRender(
  input: PersistRenderInput,
  client?: SupabaseClient,
): Promise<PersistRenderResult | null> {
  const db = client ?? getSupabaseAdmin();
  const renderId = randomUUID();
  const path = `${input.userId}/${renderId}.webp`;

  // 1. Upload bytes.
  const { error: uploadErr } = await db.storage
    .from(RENDERS_BUCKET)
    .upload(path, input.imageBuffer, {
      contentType: "image/webp",
      cacheControl: "604800",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[renders-db] upload failed:", uploadErr.message);
    return null;
  }

  // 2. Insert DB row with the same id so we can correlate.
  const { data, error: insertErr } = await db
    .from("wall_renders")
    .insert({
      id: renderId,
      layout_id: input.layoutId,
      user_id: input.userId,
      kind: input.kind,
      output_path: path,
      layout_hash: input.layoutHash,
      cost_units: input.costUnits,
      provider: input.provider ?? null,
      prompt_seed: input.promptSeed ?? null,
    })
    .select("*")
    .single();
  if (insertErr || !data) {
    console.error(
      "[renders-db] insert failed (file uploaded but not recorded):",
      insertErr?.message,
    );
    return null;
  }

  // 3. Resolve public URL.
  const publicUrl = getPublicRenderUrl(path, db);

  return {
    render: {
      id: data.id,
      layout_id: data.layout_id,
      user_id: data.user_id,
      kind: data.kind,
      output_path: data.output_path,
      layout_hash: data.layout_hash,
      cost_units: data.cost_units,
      kept: data.kept,
      provider: data.provider,
      prompt_seed: data.prompt_seed,
      created_at: data.created_at,
    },
    publicUrl,
  };
}

/**
 * Resolve a render path (as stored in `wall_renders.output_path`) to its
 * publicly-fetchable URL. Useful for cache hits, we re-derive the URL
 * from the cached row's `output_path` rather than persisting URLs.
 */
export function getPublicRenderUrl(
  path: string,
  client?: SupabaseClient,
): string {
  const db = client ?? getSupabaseAdmin();
  const { data } = db.storage.from(RENDERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
