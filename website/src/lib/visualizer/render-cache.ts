/**
 * Render cache lookup.
 *
 * If the user already rendered the same layout-hash within the cache TTL,
 * return that render's public URL instead of running compositing again.
 * The user is NOT charged a quota unit for cache hits, that's the whole
 * point of the optimisation.
 *
 * Cache window:
 *   24 hours by default. Long enough that "I rendered, then drag-jiggled
 *   and re-rendered" doesn't double-charge; short enough that stale art
 *   doesn't haunt the editor (e.g. user changed the work's image upstream).
 *
 * Per-user keying:
 *   The cache is scoped to (user_id, layout_hash). Two different users
 *   rendering the same layout each get their own render, we don't cross-
 *   share, both for privacy and because each user owns their own copy of
 *   the output asset.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { RenderKind, WallRender } from "./types";

const DEFAULT_TTL_HOURS = 24;

interface CacheRow {
  id: string;
  layout_id: string | null;
  user_id: string;
  kind: RenderKind;
  output_path: string;
  layout_hash: string;
  cost_units: number;
  kept: boolean;
  provider: string | null;
  prompt_seed: unknown;
  created_at: string;
}

export interface FindCachedInput {
  userId: string;
  layoutHash: string;
  kind: RenderKind;
  /** Override the 24h default. */
  ttlHours?: number;
  /** Inject a fixed clock for tests. */
  now?: Date;
}

/**
 * Find a cached render. Returns null if no row meets all of:
 *   - user_id matches
 *   - layout_hash matches
 *   - kind matches (HD render shouldn't reuse a Standard render)
 *   - created_at within the TTL window
 */
export async function findCachedRender(
  input: FindCachedInput,
  client?: SupabaseClient,
): Promise<WallRender | null> {
  const db = client ?? getSupabaseAdmin();
  const ttlMs = (input.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - ttlMs).toISOString();

  const { data, error } = await db
    .from("wall_renders")
    .select("*")
    .eq("user_id", input.userId)
    .eq("layout_hash", input.layoutHash)
    .eq("kind", input.kind)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CacheRow>();

  if (error) {
    console.warn("[render-cache] lookup failed:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToRender(data);
}

function rowToRender(row: CacheRow): WallRender {
  return {
    id: row.id,
    layout_id: row.layout_id,
    user_id: row.user_id,
    kind: row.kind,
    output_path: row.output_path,
    layout_hash: row.layout_hash,
    cost_units: row.cost_units,
    kept: row.kept,
    provider: row.provider,
    prompt_seed: row.prompt_seed as Record<string, unknown> | null,
    created_at: row.created_at,
  };
}
