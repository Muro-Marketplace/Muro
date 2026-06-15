/**
 * Idempotency claim helpers for long-running mutation endpoints.
 *
 * Pattern: before making any external call (Stripe, email, etc.) that is
 * expensive or non-idempotent, atomically "claim" the resource by flipping
 * its status from 'pending' → 'processing'. The conditional update only
 * succeeds for one concurrent caller; all others see null from maybeSingle
 * and must return 409 immediately without touching Stripe.
 *
 * This module is the single owner of the claim/release pattern. Do not
 * replicate the conditional-update logic elsewhere — import from here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// We accept any Supabase admin client shape (avoids importing the full type
// that references generated DB types we don't want to couple to here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Pick<SupabaseClient<any, any, any>, "from">;

/**
 * Atomically transition `table.status` from 'pending' → 'processing' for the
 * row with the given `id`.
 *
 * Returns the updated row if the claim succeeded (this caller owns the work),
 * or `null` if zero rows matched (another caller already claimed it, or the
 * row was never pending). Never throws on zero-row results.
 */
export async function claimPending<T>(
  db: AnyClient,
  table: string,
  id: string,
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .update({ status: "processing" })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  // A genuine DB error (connection drop, lock timeout) must propagate, not be
  // swallowed as a null "already claimed" — that would mask an outage as a
  // false 409 to the caller. A zero-row race still returns data === null.
  if (error) throw error;

  return (data as T) ?? null;
}

/**
 * Release a previously-claimed row back to 'pending'.
 *
 * Call this in any error path that occurs after a successful `claimPending`
 * but before the terminal status (approved / rejected) is written. This keeps
 * the request actionable for a retry rather than leaving it stuck in
 * 'processing'.
 */
export async function releaseClaim(
  db: AnyClient,
  table: string,
  id: string,
): Promise<void> {
  const { error } = await db
    .from(table)
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "processing");

  // This is already an error path, so we don't re-throw — but a failed rollback
  // strands the row in 'processing' silently. Log it so a stuck money row is
  // observable.
  if (error) {
    console.error("[idempotency] releaseClaim failed", { table, id, error });
  }
}
