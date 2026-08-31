// Unified artist outreach cap. Caps NEW venue contact across a rolling
// 7-day window, on every surface an artist can initiate contact through:
// placement requests, first-contact messages, and artwork-request responses.
// Replies inside an existing thread or counter-offers on existing placements
// don't count.
//
// Plans:
//   core    → 3 per rolling week
//   premium → 6 per rolling week
//   pro     → 15 per rolling week
//   (`-1` sentinel = unlimited, reserved for staff)
//
// Why rolling, not per calendar day or per calendar week: artists do outreach
// in one sitting, usually an evening or a weekend. A daily cap punished exactly
// that and rewarded nobody. A calendar week would reset at Monday midnight,
// which invites gaming and short-changes anyone who joins on a Saturday. The
// window here is simply "the last 7 days from now", so a unit spent last
// Tuesday comes back this Tuesday.
//
// Callers pass the number of units (e.g. multi-work placement request counts as N).

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Units of new-venue outreach allowed per rolling week, by plan.
 *
 * Exported because the pricing cards, the application form and the plan emails
 * all quote these numbers to artists as a selling point. They were hardcoded in
 * three places and a merge briefly dropped two of them; the enforcement and the
 * promise have to come from one place, like `WORKS_CAP` and
 * `ACTIVE_PLACEMENT_CAP` in `@/lib/pricing`.
 */
export const OUTREACH_WEEKLY_LIMIT: Record<string, number> = {
  core: 3,
  premium: 6,
  pro: 15,
};

const WEEKLY_LIMITS = OUTREACH_WEEKLY_LIMIT;

/** Length of the rolling window, in days. */
export const OUTREACH_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OutreachUsage {
  /** Normalised plan key ('core' | 'premium' | 'pro', or an unknown key). */
  plan: string;
  /** Display-cased plan name, e.g. 'Premium'. */
  planName: string;
  /** Units allowed in the window. -1 means unlimited. */
  limit: number;
  /** Units already spent inside the window. */
  used: number;
  /** Units still available. Always >= 0. */
  remaining: number;
  /**
   * When the next unit frees up, ISO. Null when a unit is available now, or
   * when the plan is unlimited. With a rolling window this is simply the
   * oldest counted unit's timestamp plus the window length.
   */
  nextSlotAt: string | null;
  /**
   * Conversation ids the artist has messaged inside the window. Used by the
   * reply exemption; exposed so callers don't need a second round trip.
   */
  conversationsInWindow: Set<string>;
  /** Ascending timestamps of every counted unit. Oldest first. */
  spentAt: string[];
}

export interface OutreachCapResult {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  nextSlotAt: string | null;
  /** Status code to return if disallowed. Always 429. */
  status: 429;
  /** Human-readable message safe to surface in UI. */
  message: string;
}

export interface OutreachCapOpts {
  /**
   * When set, and the conversation id already appears in the artist's
   * messages inside the window, the call is treated as a reply / re-contact
   * (not new outreach) and is unconditionally allowed. This mirrors the
   * `!startedToday.has(cidLocal)` guard that the old inline counter in
   * the messages route used to implement.
   *
   * The exemption ONLY fires when `exemptConversationId` is already present
   * in the artist's set of conversations messaged in the window — i.e. it is a
   * reply or re-contact into a thread that was already counted. A conversation
   * id not yet in that set is treated as a normal first contact and is fully
   * subject to the cap.
   */
  exemptConversationId?: string;
}

function planNameFor(planKey: string): string {
  return planKey === "premium" ? "Premium" : planKey === "pro" ? "Pro" : "Core";
}

/**
 * Reads an artist's outreach usage across the rolling window. Exported so the
 * UI can show remaining allowance BEFORE the artist writes a request, rather
 * than only discovering the cap by hitting it.
 */
export async function getArtistOutreachUsage(
  db: SupabaseClient,
  artistUserId: string,
): Promise<OutreachUsage> {
  const planRow = await db
    .from("artist_profiles")
    .select("subscription_plan")
    .eq("user_id", artistUserId)
    .single();
  const planKey = ((planRow.data as { subscription_plan?: string | null } | null)?.subscription_plan || "core").toLowerCase();
  const limit = WEEKLY_LIMITS[planKey] ?? WEEKLY_LIMITS.core;

  const since = new Date(Date.now() - OUTREACH_WINDOW_DAYS * MS_PER_DAY).toISOString();

  // Sum across the three surfaces.
  const [placements, conversations, responses] = await Promise.all([
    // Migration 122: `created_by_user_id`, stamped once at insert and frozen by
    // a trigger. The cap used to count `proposed_by_user_id`, which migration
    // 024 created for milestone confirmation and which a counter-offer, a stage
    // advance and a list-page backfill all rewrite — so the count moved for
    // reasons that had nothing to do with outreach.
    db
      .from("placements")
      .select("created_at")
      .eq("created_by_user_id", artistUserId)
      .gte("created_at", since),
    db
      .from("messages")
      .select("conversation_id, created_at")
      .eq("sender_id", artistUserId)
      .gte("created_at", since),
    db
      .from("artwork_request_responses")
      .select("created_at")
      .eq("artist_user_id", artistUserId)
      .gte("created_at", since),
  ]);

  const spentAt: string[] = [];

  for (const r of (placements.data || []) as Array<{ created_at: string | null }>) {
    if (r.created_at) spentAt.push(r.created_at);
  }
  for (const r of (responses.data || []) as Array<{ created_at: string | null }>) {
    if (r.created_at) spentAt.push(r.created_at);
  }

  // De-duplicate first-contact messages by conversation_id (multiple messages
  // in the same new thread = one outreach unit). The unit was spent when the
  // thread was opened, so the EARLIEST message in each conversation is the
  // timestamp that decides when it ages back out of the window.
  const firstMessageByConversation = new Map<string, string>();
  for (const r of (conversations.data || []) as Array<{ conversation_id: string | null; created_at: string | null }>) {
    if (!r.conversation_id) continue;
    const at = r.created_at || new Date().toISOString();
    const existing = firstMessageByConversation.get(r.conversation_id);
    if (!existing || at < existing) firstMessageByConversation.set(r.conversation_id, at);
  }
  for (const at of firstMessageByConversation.values()) spentAt.push(at);

  spentAt.sort();

  const used = spentAt.length;
  const unlimited = limit === -1;
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);

  return {
    plan: planKey,
    planName: planNameFor(planKey),
    limit,
    used,
    remaining,
    nextSlotAt: unlimited || remaining > 0 ? null : nextSlotFor(spentAt, 1, used, limit),
    conversationsInWindow: new Set(firstMessageByConversation.keys()),
    spentAt,
  };
}

/**
 * When enough units will have aged out of the window for `units` more to fit.
 * Returns null when the timestamps needed aren't there to work it out.
 */
function nextSlotFor(spentAt: string[], units: number, used: number, limit: number): string | null {
  // How many of the spent units must expire before this attempt fits.
  const mustExpire = used + units - limit;
  if (mustExpire <= 0) return null;
  const oldestNeeded = spentAt[mustExpire - 1];
  if (!oldestNeeded) return null;
  const t = new Date(oldestNeeded).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + OUTREACH_WINDOW_DAYS * MS_PER_DAY).toISOString();
}

function formatSlotDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export async function checkArtistOutreachCap(
  db: SupabaseClient,
  artistUserId: string,
  units = 1,
  opts?: OutreachCapOpts,
): Promise<{ ok: true } | { ok: false; result: OutreachCapResult }> {
  const usage = await getArtistOutreachUsage(db, artistUserId);

  // Guards the unlimited sentinel (-1). No WEEKLY_LIMITS entry currently maps
  // to -1 (reserved for a future staff/unlimited plan), so this branch is
  // intentionally unreachable today. Removing it would cause a future -1
  // entry to silently block ALL outreach (`used + units > -1` is always true).
  if (usage.limit === -1) return { ok: true };

  // A message into a conversation the artist already opened inside the window
  // is a reply / re-contact, not new outreach, so it is exempt (mirrors the
  // old cidLocal guard in the messages route).
  if (opts?.exemptConversationId && usage.conversationsInWindow.has(opts.exemptConversationId)) {
    return { ok: true };
  }

  if (usage.used + units > usage.limit) {
    const nextSlotAt = nextSlotFor(usage.spentAt, units, usage.used, usage.limit);
    const when = formatSlotDate(nextSlotAt);
    return {
      ok: false,
      result: {
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
        remaining: Math.max(0, usage.limit - usage.used),
        nextSlotAt,
        status: 429,
        message:
          `Your ${usage.planName} plan covers ${usage.limit} new venue ${usage.limit === 1 ? "approach" : "approaches"} a week, ` +
          `counting placement requests, first messages and artwork request responses together. ` +
          (when
            ? `You'll have another from ${when}, or upgrade your plan to reach more venues now.`
            : `Upgrade your plan to reach more venues.`),
      },
    };
  }

  return { ok: true };
}

/**
 * The 429 body. Every surface returns the same shape: `error` carries the
 * machine code and `message` the sentence to show. Routes used to disagree
 * here — two returned `{ error: "outreach_limit_reached" }` with the sentence
 * hidden in `message`, and one returned the bare result with no `error` key at
 * all, so clients reading `data.error` showed artists either the raw code or
 * "Request failed (429)".
 */
export function outreachCapPayload(result: OutreachCapResult) {
  return {
    error: "outreach_limit_reached",
    message: result.message,
    plan: result.plan,
    limit: result.limit,
    used: result.used,
    remaining: result.remaining,
    nextSlotAt: result.nextSlotAt,
  };
}
