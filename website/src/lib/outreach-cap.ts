// Unified artist outreach cap. Caps NEW venue contact per calendar day
// across all surfaces: placement requests, first-contact messages, and
// artwork-request responses. Replies inside an existing thread or
// counter-offers on existing placements don't count.
//
// Plans:
//   core    → 2/day
//   premium → 5/day
//   pro     → 10/day
//   (`-1` sentinel = unlimited, reserved for staff)
//
// Callers pass the number of units (e.g. multi-work placement request counts as N).

import type { SupabaseClient } from "@supabase/supabase-js";

const DAILY_LIMITS: Record<string, number> = {
  core: 2,
  premium: 5,
  pro: 10,
};

export interface OutreachCapResult {
  plan: string;
  limit: number;
  used: number;
  /** Status code to return if disallowed. Always 429. */
  status: 429;
  /** Human-readable message safe to surface in UI. */
  message: string;
}

export interface OutreachCapOpts {
  /**
   * When set, and the conversation id already appears in the artist's
   * messages today, the call is treated as a reply / re-contact (not
   * new outreach) and is unconditionally allowed. This mirrors the
   * `!startedToday.has(cidLocal)` guard that the old inline counter in
   * the messages route used to implement.
   *
   * The exemption ONLY fires when `exemptConversationId` is already present
   * in the artist's set of conversations messaged today — i.e. it is a reply
   * or re-contact into a thread that was already counted. A conversation id
   * not yet in today's set is treated as a normal first contact and is fully
   * subject to the daily cap.
   */
  exemptConversationId?: string;
}

export async function checkArtistOutreachCap(
  db: SupabaseClient,
  artistUserId: string,
  units = 1,
  opts?: OutreachCapOpts,
): Promise<{ ok: true } | { ok: false; result: OutreachCapResult }> {
  const planRow = await db
    .from("artist_profiles")
    .select("subscription_plan")
    .eq("user_id", artistUserId)
    .single();
  const planKey = ((planRow.data as { subscription_plan?: string | null } | null)?.subscription_plan || "core").toLowerCase();
  const limit = DAILY_LIMITS[planKey] ?? DAILY_LIMITS.core;
  // Guards the unlimited sentinel (-1). No DAILY_LIMITS entry currently maps
  // to -1 (reserved for a future staff/unlimited plan), so this branch is
  // intentionally unreachable today. Removing it would cause a future -1
  // entry to silently block ALL outreach (`used + units > -1` is always true).
  if (limit === -1) return { ok: true };

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const since = dayStart.toISOString();

  // Sum across the three surfaces.
  const [placements, conversations, responses] = await Promise.all([
    // N3, filter side. `placements` has no `requester_user_id`; the column is
    // `proposed_by_user_id`. PostgREST rejected the whole query, so this leg of
    // the cap counted null, which reads as zero: placement requests were FREE.
    // An artist on Core, limited to 2 first contacts a day, could send as many
    // placement requests as they liked, and only the messages and
    // artwork-response legs were ever enforced.
    db
      .from("placements")
      .select("id", { count: "exact", head: true })
      .eq("proposed_by_user_id", artistUserId)
      .gte("created_at", since),
    db
      .from("messages")
      .select("conversation_id, created_at")
      .eq("sender_id", artistUserId)
      .gte("created_at", since),
    db
      .from("artwork_request_responses")
      .select("id", { count: "exact", head: true })
      .eq("artist_user_id", artistUserId)
      .gte("created_at", since),
  ]);

  const placementCount = placements.count || 0;
  const responseCount = responses.count || 0;
  // De-duplicate first-contact messages by conversation_id (multiple
  // messages in the same new thread = one outreach unit).
  const conversationsToday = new Set<string>();
  for (const r of (conversations.data || []) as Array<{ conversation_id: string | null }>) {
    if (r.conversation_id) conversationsToday.add(r.conversation_id);
  }
  const messageCount = conversationsToday.size;

  const used = placementCount + messageCount + responseCount;

  // A message into a conversation the artist already started today is a
  // reply / re-contact, not new outreach, so it is exempt (mirrors the
  // old cidLocal guard in the messages route).
  if (opts?.exemptConversationId && conversationsToday.has(opts.exemptConversationId)) {
    return { ok: true };
  }

  if (used + units > limit) {
    const planName = planKey === "premium" ? "Premium" : planKey === "pro" ? "Pro" : "Core";
    return {
      ok: false,
      result: {
        plan: planKey,
        limit,
        used,
        status: 429,
        message:
          `Your ${planName} plan allows ${limit} new venue outreach${limit === 1 ? "" : "es"} per day across placements, messages, and request responses. ` +
          `Try again tomorrow, or upgrade your plan to reach more venues.`,
      },
    };
  }

  return { ok: true };
}
