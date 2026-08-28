// A cap on how much mail an anonymous stranger can aim at one address.
//
// 09 §D.4 raises this and leaves it open: "the rate limit is the only thing
// between you and using the contact form as a spam relay. UNCONFIRMED whether
// the existing 5/min IP limit is sufficient under a distributed attempt."
//
// It is not. Two routes now email an address that an UNAUTHENTICATED caller
// typed into a form, with no proof they own it: the contact acknowledgement and
// the newsletter confirmation. Everything `sendEmail` already does to stop
// flooding is keyed on the wrong thing for that case:
//
//   - the idempotency key stops a RETRY, not a fresh submission with new text;
//   - the throttle needs `input.userId`, and a stranger has none;
//   - `orders_and_payouts` sets throttleCount 0 anyway, deliberately, because a
//     receipt must never be dropped;
//   - the routes' own 5/min limit is per IP, and the attack that matters here is
//     many IPs at one victim.
//
// So the cap has to be per RECIPIENT. Refuse the send, not the request: the
// submission is still stored and an admin is still told, because a victim being
// flooded must not also lose the ability to contact support.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Deliberately low. Nobody legitimately fills the same form four times an hour. */
export const DEFAULT_MAX_PER_HOUR = 3;

export interface UnverifiedRecipientCheck {
  to: string;
  template: string;
  maxPerHour?: number;
  windowHours?: number;
  db?: SupabaseClient;
}

/**
 * True when it is still fine to send `template` to `to`.
 *
 * Fails OPEN on a database error. This guards against abuse, and a Supabase
 * blip must not silently stop a real person's acknowledgement; the route's IP
 * limit is still in front of it.
 */
export async function unverifiedRecipientAllowed(
  input: UnverifiedRecipientCheck,
): Promise<boolean> {
  const db = input.db ?? getSupabaseAdmin();
  const max = input.maxPerHour ?? DEFAULT_MAX_PER_HOUR;
  const since = new Date(Date.now() - (input.windowHours ?? 1) * 3_600_000).toISOString();

  const { count, error } = await db
    .from("email_events")
    .select("id", { count: "exact", head: true })
    // Match how sendEmail stores it, or the count is always 0 and the guard is
    // decorative.
    .eq("to_email", input.to.trim().toLowerCase())
    .eq("template", input.template)
    .in("status", ["sent", "queued"])
    .gte("created_at", since);

  if (error) {
    console.error("[unverified-recipient] check failed, allowing the send:", error.message);
    return true;
  }
  if ((count ?? 0) >= max) {
    console.warn(
      `[unverified-recipient] refusing ${input.template} to a flooded address (${count} in the last hour)`,
    );
    return false;
  }
  return true;
}
