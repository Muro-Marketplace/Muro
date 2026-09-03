// Tests for the unified artist outreach cap (checkArtistOutreachCap /
// getArtistOutreachUsage).
//
// Covers:
//  - plan limits: Core / Premium / Pro per rolling 7 days, read from OUTREACH_WEEKLY_LIMIT.
//  - the rolling window: units older than 7 days don't count, units inside do.
//  - the counting column: placements are counted by created_by_user_id
//    (migration 122), NOT proposed_by_user_id, which counters and stage
//    advances rewrite underneath the cap.
//  - cross-surface aggregation (1.6 / 1.7): placements + messages + artwork
//    request responses aggregate, so artists can't beat the cap by spreading.
//  - exemptConversationId: reply into an existing thread is free.
//  - units: a multi-row placement request consumes N units.
//  - nextSlotAt: when the blocked artist gets their next approach back.
//  - the 429 payload shape every route returns.

import { describe, it, expect } from "vitest";
import {
  checkArtistOutreachCap,
  getArtistOutreachUsage,
  outreachCapPayload,
  OUTREACH_WINDOW_DAYS,
  OUTREACH_WEEKLY_LIMIT,
} from "./outreach-cap";
import type { SupabaseClient } from "@supabase/supabase-js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO timestamp `days` days in the past. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

// ---------------------------------------------------------------------------
// Minimal mock builder
// ---------------------------------------------------------------------------

interface MockOpts {
  plan?: string;
  /** created_at values of placements the artist CREATED (created_by_user_id). */
  placementsAt?: string[];
  /** [conversation_id, created_at] pairs for messages the artist sent. */
  messagesAt?: Array<[string, string]>;
  /** created_at values of artwork-request responses. */
  responsesAt?: string[];
  /**
   * Rows that would be returned if the cap filtered on proposed_by_user_id
   * instead of created_by_user_id. The mock returns these ONLY for that
   * column, so a regression back to the old column shows up as a test
   * failure rather than a silent behaviour change.
   */
  proposedOnlyAt?: string[];
}

function makeDb({
  plan = "core",
  placementsAt = [],
  messagesAt = [],
  responsesAt = [],
  proposedOnlyAt = [],
}: MockOpts): SupabaseClient {
  // The helper always filters `.gte("created_at", since)`, so the mock honours
  // the window itself rather than trusting the caller to pre-filter.
  const withinWindow = (rows: string[], since: string) => rows.filter((at) => at >= since);

  const db = {
    from: (table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { subscription_plan: plan }, error: null }),
            }),
          }),
        };
      }

      if (table === "placements") {
        return {
          select: () => ({
            eq: (column: string) => ({
              gte: async (_col: string, since: string) => {
                const rows = column === "created_by_user_id" ? placementsAt : proposedOnlyAt;
                return {
                  data: withinWindow(rows, since).map((created_at) => ({ created_at })),
                  error: null,
                };
              },
            }),
          }),
        };
      }

      if (table === "messages") {
        return {
          select: () => ({
            eq: () => ({
              gte: async (_col: string, since: string) => ({
                data: messagesAt
                  .filter(([, at]) => at >= since)
                  .map(([conversation_id, created_at]) => ({ conversation_id, created_at })),
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "artwork_request_responses") {
        return {
          select: () => ({
            eq: () => ({
              gte: async (_col: string, since: string) => ({
                data: withinWindow(responsesAt, since).map((created_at) => ({ created_at })),
                error: null,
              }),
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient;

  return db;
}

/** n placement units, all spent an hour ago. */
function recentPlacements(n: number): string[] {
  return Array.from({ length: n }, () => daysAgo(0.04));
}

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — plan limits", () => {
  it("allows when used < limit", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(2) });
    expect((await checkArtistOutreachCap(db, "u-1")).ok).toBe(true);
  });

  it("blocks the approach past the Core limit", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.limit).toBe(OUTREACH_WEEKLY_LIMIT.core);
      expect(result.result.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
      expect(result.result.remaining).toBe(0);
    }
  });

  it("Premium allows up to its limit and blocks the next", async () => {
    expect((await checkArtistOutreachCap(makeDb({ plan: "premium", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.premium - 1) }), "u-1")).ok).toBe(true);
    expect((await checkArtistOutreachCap(makeDb({ plan: "premium", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.premium) }), "u-1")).ok).toBe(false);
  });

  it("Pro allows up to its limit and blocks the next", async () => {
    expect((await checkArtistOutreachCap(makeDb({ plan: "pro", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.pro - 1) }), "u-1")).ok).toBe(true);
    expect((await checkArtistOutreachCap(makeDb({ plan: "pro", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.pro) }), "u-1")).ok).toBe(false);
  });

  it("falls back to Core for an unknown plan key rather than crashing", async () => {
    const db = makeDb({ plan: "enterprise", placementsAt: recentPlacements(100) });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.limit).toBe(OUTREACH_WEEKLY_LIMIT.core);
  });

  it("treats a null subscription_plan as Core", async () => {
    const db = makeDb({ plan: "", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.plan).toBe("core");
  });
});

// ---------------------------------------------------------------------------
// The rolling window
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — rolling 7-day window", () => {
  it("ignores units older than the window", async () => {
    // Three placements, all 8 days old: outside a 7-day window, so the
    // artist starts the day with a full allowance.
    const db = makeDb({ plan: "core", placementsAt: [daysAgo(8), daysAgo(9), daysAgo(30)] });
    const usage = await getArtistOutreachUsage(db, "u-1");
    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(OUTREACH_WEEKLY_LIMIT.core);
  });

  it("counts units from six days ago, which a calendar-week reset would have dropped", async () => {
    const db = makeDb({ plan: "core", placementsAt: [daysAgo(6), daysAgo(5), ...recentPlacements(OUTREACH_WEEKLY_LIMIT.core - 2)] });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
  });

  it("counts an artist's whole sitting, which a daily cap would have split", async () => {
    // Three approaches in one evening. Under the old 2-a-day cap the third
    // was refused; a weekly allowance is precisely meant to permit this.
    const db = makeDb({ plan: "core", placementsAt: [daysAgo(0.01), daysAgo(0.02)] });
    expect((await checkArtistOutreachCap(db, "u-1")).ok).toBe(true);
  });

  it("reports nextSlotAt as the oldest counted unit plus the window", async () => {
    const oldest = daysAgo(2);
    const db = makeDb({ plan: "core", placementsAt: [oldest, ...Array.from({ length: OUTREACH_WEEKLY_LIMIT.core - 1 }, () => daysAgo(0.5))] });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const expected = new Date(new Date(oldest).getTime() + OUTREACH_WINDOW_DAYS * MS_PER_DAY);
      expect(result.result.nextSlotAt).toBe(expected.toISOString());
    }
  });

  it("nextSlotAt for a 2-unit request is when the SECOND-oldest unit expires", async () => {
    const second = daysAgo(2);
    const db = makeDb({ plan: "core", placementsAt: [daysAgo(3), second, ...Array.from({ length: OUTREACH_WEEKLY_LIMIT.core - 2 }, () => daysAgo(1))] });
    // at the limit, asking for 2: two units must expire, so the 2nd oldest.
    const result = await checkArtistOutreachCap(db, "u-1", 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const expected = new Date(new Date(second).getTime() + OUTREACH_WINDOW_DAYS * MS_PER_DAY);
      expect(result.result.nextSlotAt).toBe(expected.toISOString());
    }
  });

  it("leaves nextSlotAt null while the artist still has allowance", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(1) });
    const usage = await getArtistOutreachUsage(db, "u-1");
    expect(usage.nextSlotAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The counting column (migration 122)
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — counts created_by_user_id, not proposed_by_user_id", () => {
  it("counts placements the artist created", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    expect((await checkArtistOutreachCap(db, "u-art")).ok).toBe(false);
  });

  it("does not count rows where the artist is only the current proposer", async () => {
    // A counter-offer flips proposed_by_user_id to the counter sender. Under
    // the old column that silently spent an outreach unit, contradicting the
    // rule that counters are free.
    const db = makeDb({ plan: "core", placementsAt: [], proposedOnlyAt: recentPlacements(5) });
    const usage = await getArtistOutreachUsage(db, "u-art");
    expect(usage.used).toBe(0);
    expect((await checkArtistOutreachCap(db, "u-art")).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-surface aggregation (findings 1.6 / 1.7)
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — cross-surface aggregation (1.6 / 1.7)", () => {
  it("blocks a first-contact message when the week's placements are spent", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
  });

  it("blocks a placement when the week's messages are spent", async () => {
    const db = makeDb({
      plan: "core",
      messagesAt: Array.from({ length: OUTREACH_WEEKLY_LIMIT.core }, (_, i) => [`cid-${i}`, daysAgo(1 + i * 0.1)] as [string, string]),
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
  });

  it("adds the three surfaces together", async () => {
    const db = makeDb({
      plan: "core",
      placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core - 2),
      messagesAt: [["cid-a", daysAgo(2)]],
      responsesAt: [daysAgo(3)],
    });
    const usage = await getArtistOutreachUsage(db, "u-art");
    expect(usage.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
    expect((await checkArtistOutreachCap(db, "u-art")).ok).toBe(false);
  });

  it("de-duplicates messages: many messages in one thread are one unit", async () => {
    const db = makeDb({
      plan: "core",
      messagesAt: [["same", daysAgo(1)], ["same", daysAgo(0.9)], ["same", daysAgo(0.5)]],
    });
    const usage = await getArtistOutreachUsage(db, "u-art");
    expect(usage.used).toBe(1);
  });

  it("ages a thread out from its FIRST message, not its most recent", async () => {
    // The unit was spent when the thread was opened 8 days ago. Later replies
    // into it must not keep it pinned inside the window.
    const db = makeDb({
      plan: "core",
      messagesAt: [["old-thread", daysAgo(8)], ["old-thread", daysAgo(1)]],
    });
    const usage = await getArtistOutreachUsage(db, "u-art");
    // The 8-day-old row is outside the window, so only the recent row is read
    // and the thread's first-seen timestamp inside the window is 1 day ago.
    expect(usage.used).toBe(1);
    expect(usage.spentAt).toHaveLength(1);
  });

  it("counts artwork_request_responses as outreach units", async () => {
    const db = makeDb({ plan: "core", responsesAt: Array.from({ length: OUTREACH_WEEKLY_LIMIT.core }, (_, i) => daysAgo(1 + i * 0.1)) });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
  });
});

// ---------------------------------------------------------------------------
// exemptConversationId (reply-exemption)
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — exemptConversationId", () => {
  it("allows a reply into a thread already opened this week, even at cap", async () => {
    const db = makeDb({
      plan: "core",
      placementsAt: recentPlacements(2),
      messagesAt: [["cid-existing", daysAgo(3)]],
    });
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-existing",
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a NEW conversation at cap even when an exempt id is passed", async () => {
    const db = makeDb({
      plan: "core",
      messagesAt: Array.from({ length: OUTREACH_WEEKLY_LIMIT.core }, (_, i) => [`cid-${i}`, daysAgo(1 + i * 0.1)] as [string, string]),
    });
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-new",
    });
    expect(result.ok).toBe(false);
  });

  it("does not exempt a thread whose only message has aged out of the window", async () => {
    const db = makeDb({
      plan: "core",
      placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core),
      messagesAt: [["cid-stale", daysAgo(20)]],
    });
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-stale",
    });
    expect(result.ok).toBe(false);
  });

  it("enforces the cap when no opts are passed", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    expect((await checkArtistOutreachCap(db, "u-art")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// units parameter
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — units (multi-row placement request)", () => {
  it("blocks when used + units > limit", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(1) });
    const result = await checkArtistOutreachCap(db, "u-art", OUTREACH_WEEKLY_LIMIT.core);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.limit).toBe(OUTREACH_WEEKLY_LIMIT.core);
      expect(result.result.used).toBe(1);
    }
  });

  it("allows when used + units == limit exactly", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(1) });
    expect((await checkArtistOutreachCap(db, "u-art", 2)).ok).toBe(true);
  });

  it("Premium: two short of the limit plus 3 units is blocked", async () => {
    const db = makeDb({ plan: "premium", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.premium - 2) });
    expect((await checkArtistOutreachCap(db, "u-art", 3)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The 429 payload
// ---------------------------------------------------------------------------

describe("outreachCapPayload", () => {
  it("carries the machine code in `error` and the sentence in `message`", async () => {
    const db = makeDb({ plan: "core", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.core) });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const payload = outreachCapPayload(result.result);
    expect(payload.error).toBe("outreach_limit_reached");
    expect(payload.message).toContain("Core");
    expect(payload.message).toContain(`${OUTREACH_WEEKLY_LIMIT.core} new venue approaches a week`);
    expect(payload.limit).toBe(OUTREACH_WEEKLY_LIMIT.core);
    expect(payload.used).toBe(OUTREACH_WEEKLY_LIMIT.core);
    expect(payload.remaining).toBe(0);
    expect(payload.nextSlotAt).toBeTruthy();
  });

  it("keeps the user-facing message free of dashes (public-copy rule)", async () => {
    const db = makeDb({ plan: "pro", placementsAt: recentPlacements(OUTREACH_WEEKLY_LIMIT.pro) });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.result.message).not.toMatch(/[—–]|--/);
  });
});
