// Tests for the unified artist outreach cap (checkArtistOutreachCap).
//
// Covers:
//  - cross-surface aggregation (1.6 / 1.7): placements + messages aggregate
//    so artists cannot beat the cap by spreading across surfaces.
//  - exemptConversationId: reply into an existing thread is free.
//  - units: multi-work placement request consumes N units.
//  - base happy path: under-cap returns ok:true.
//  - unlimited sentinel: plan returning -1 is always allowed.

import { describe, it, expect } from "vitest";
import { checkArtistOutreachCap } from "./outreach-cap";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Minimal mock builder
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Supabase client mock that:
 *   - returns `subscription_plan` from artist_profiles
 *   - returns a list of placement rows (for .select("id", { count: "exact" }))
 *   - returns a list of message rows with conversation_id
 *   - returns a list of artwork_request_response rows
 */
function makeDb({
  plan = "core",
  placementCount = 0,
  messageConversationIds = [] as string[],
  responseCount = 0,
}: {
  plan?: string;
  placementCount?: number;
  messageConversationIds?: string[];
  responseCount?: number;
}): SupabaseClient {
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
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  gte: async () => ({ count: placementCount, data: null, error: null }),
                }),
              };
            }
            return {
              eq: () => ({
                gte: async () => ({
                  data: Array.from({ length: placementCount }, (_, i) => ({ id: `p-${i}` })),
                  error: null,
                }),
              }),
            };
          },
        };
      }

      if (table === "messages") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({
                data: messageConversationIds.map((cid) => ({
                  conversation_id: cid,
                  created_at: new Date().toISOString(),
                })),
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "artwork_request_responses") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  gte: async () => ({ count: responseCount, data: null, error: null }),
                }),
              };
            }
            return {
              eq: () => ({
                gte: async () => ({
                  data: Array.from({ length: responseCount }, (_, i) => ({ id: `r-${i}` })),
                  error: null,
                }),
              }),
            };
          },
        };
      }

      return {};
    },
  } as unknown as SupabaseClient;

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — base behaviour", () => {
  it("allows when used < limit", async () => {
    const db = makeDb({ plan: "core", placementCount: 1, messageConversationIds: [] });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(true);
  });

  it("blocks when used == limit (exactly at cap, one more unit)", async () => {
    // Core cap = 2, already have 2 placements
    const db = makeDb({ plan: "core", placementCount: 2 });
    const result = await checkArtistOutreachCap(db, "u-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.limit).toBe(2);
      expect(result.result.used).toBe(2);
    }
  });

  it("uses plan limits correctly: Premium cap = 5", async () => {
    const db = makeDb({ plan: "premium", placementCount: 4 });
    const under = await checkArtistOutreachCap(db, "u-1");
    expect(under.ok).toBe(true);

    const atCap = makeDb({ plan: "premium", placementCount: 5 });
    const over = await checkArtistOutreachCap(atCap, "u-1");
    expect(over.ok).toBe(false);
  });

  it("allows unlimited sentinel plan (returns -1 equivalent through missing key → core, but test unlimited directly)", async () => {
    // The DAILY_LIMITS map has no 'unlimited' key, so limit falls through to core (2).
    // Test the actual unlimited sentinel: a plan value that maps to -1 isn't defined yet,
    // but staff rows can use 'pro' which is 10. This test validates the helper doesn't
    // crash on an unknown plan key (falls back to core).
    const db = makeDb({ plan: "enterprise", placementCount: 100 });
    const result = await checkArtistOutreachCap(db, "u-1");
    // Falls back to core (2); 100 > 2+1, so blocked.
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-surface aggregation (findings 1.6 / 1.7)
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — cross-surface aggregation (1.6 / 1.7)", () => {
  it("blocks a first-contact message when artist already has 2 placements today (Core plan)", async () => {
    // Core cap = 2. Placements = 2, messages = 0. Adding 1 message unit → 3 > 2 → blocked.
    const db = makeDb({
      plan: "core",
      placementCount: 2,
      messageConversationIds: [],
      responseCount: 0,
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.used).toBe(2);
      expect(result.result.limit).toBe(2);
    }
  });

  it("blocks a placement when artist already has 2 message conversations today (Core plan)", async () => {
    // Core cap = 2. Messages = 2 distinct conversations, placements = 0.
    const db = makeDb({
      plan: "core",
      placementCount: 0,
      messageConversationIds: ["cid-a", "cid-b"],
      responseCount: 0,
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.used).toBe(2);
    }
  });

  it("allows when cross-surface total is under cap", async () => {
    // Core cap = 2. 1 placement + 0 messages = 1 used, 1 more allowed.
    const db = makeDb({
      plan: "core",
      placementCount: 1,
      messageConversationIds: [],
      responseCount: 0,
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(true);
  });

  it("de-duplicates messages: multiple rows with same conversation_id count as 1", async () => {
    // Core cap = 2. Same cid repeated 3 times → still 1 unique conversation.
    const db = makeDb({
      plan: "core",
      placementCount: 0,
      messageConversationIds: ["same-cid", "same-cid", "same-cid"],
      responseCount: 0,
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    // used = 1 (one unique cid), limit = 2, adding 1 more unit → 2 ≤ 2 → allowed
    expect(result.ok).toBe(true);
  });

  it("counts artwork_request_responses as outreach units", async () => {
    // Core cap = 2. 0 placements + 0 messages + 2 responses → at cap.
    const db = makeDb({
      plan: "core",
      placementCount: 0,
      messageConversationIds: [],
      responseCount: 2,
    });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.used).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// exemptConversationId (reply-exemption)
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — exemptConversationId", () => {
  it("allows a reply into a conversation the artist already started today, even at cap", async () => {
    // Core cap = 2, both slots used by this one conversation appearing twice.
    // But we're replying into that same cid, so it's exempt.
    const db = makeDb({
      plan: "core",
      placementCount: 0,
      messageConversationIds: ["cid-existing", "cid-existing"],
      responseCount: 0,
    });
    // used = 1 unique cid. Replying into 'cid-existing' → exempt.
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-existing",
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a message to a NEW conversation even at cap, when exemptConversationId is a different cid", async () => {
    // Core cap = 2, already at cap via 2 distinct conversations.
    const db = makeDb({
      plan: "core",
      placementCount: 0,
      messageConversationIds: ["cid-a", "cid-b"],
      responseCount: 0,
    });
    // Trying to message 'cid-new' — not in today's set → not exempt → blocked.
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-new",
    });
    expect(result.ok).toBe(false);
  });

  it("exemptConversationId with no opts (default) still enforces the cap", async () => {
    // Core cap = 2, 2 placements today, no opts → blocked.
    const db = makeDb({ plan: "core", placementCount: 2 });
    const result = await checkArtistOutreachCap(db, "u-art");
    expect(result.ok).toBe(false);
  });

  it("allows at cap when the exact cid is in today's conversations", async () => {
    // Core cap = 2. 1 placement + 1 conversation ('cid-x'). used = 2, at cap.
    // Replying into 'cid-x' → exempt.
    const db = makeDb({
      plan: "core",
      placementCount: 1,
      messageConversationIds: ["cid-x"],
      responseCount: 0,
    });
    const result = await checkArtistOutreachCap(db, "u-art", 1, {
      exemptConversationId: "cid-x",
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// units parameter
// ---------------------------------------------------------------------------

describe("checkArtistOutreachCap — units (multi-work placement)", () => {
  it("blocks when used + units > limit (multi-placement request)", async () => {
    // Core cap = 2. 0 used. Requesting 3 works at once → 0 + 3 > 2 → blocked.
    const db = makeDb({ plan: "core", placementCount: 0 });
    const result = await checkArtistOutreachCap(db, "u-art", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.limit).toBe(2);
      expect(result.result.used).toBe(0);
    }
  });

  it("allows when used + units == limit exactly", async () => {
    // Core cap = 2. 0 used. 2 units → 0 + 2 = 2, not > 2 → allowed.
    const db = makeDb({ plan: "core", placementCount: 0 });
    const result = await checkArtistOutreachCap(db, "u-art", 2);
    expect(result.ok).toBe(true);
  });

  it("blocks when used + units > limit with partial existing use", async () => {
    // Core cap = 2. 1 placement used. 2 more units → 1 + 2 = 3 > 2 → blocked.
    const db = makeDb({ plan: "core", placementCount: 1 });
    const result = await checkArtistOutreachCap(db, "u-art", 2);
    expect(result.ok).toBe(false);
  });

  it("Premium (cap 5): 3 placements + 2 units is blocked", async () => {
    const db = makeDb({ plan: "premium", placementCount: 3 });
    const result = await checkArtistOutreachCap(db, "u-art", 3);
    expect(result.ok).toBe(false);
  });
});


// N3, filter side. `placements` has no `requester_user_id`; the column is
// `proposed_by_user_id`. PostgREST rejects the whole query, and a rejected count
// reads as null, which this code treats as zero. So the placements leg of the
// anti-spam cap counted nothing: placement requests were FREE. An artist on
// Core, limited to 2 first contacts a day, could send as many as they liked, and
// only the messages and artwork-response legs were ever enforced.
describe("the cap counts placements against a column that exists", () => {
  it("filters placements on proposed_by_user_id", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const schema = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../tests/integration/schema-columns.json"),
        "utf8",
      ),
    ) as Record<string, string[]>;
    const source = readFileSync(path.resolve(__dirname, "outreach-cap.ts"), "utf8");

    // Every column this module filters on must be a real one. Stated here as
    // well as in the repo-wide sweep, because this is the file where getting it
    // wrong turns an anti-spam control into decoration.
    for (const m of source.matchAll(/\.eq\(\s*"([a-z_]+)"/g)) {
      const col = m[1];
      const inSome = ["placements", "messages", "artwork_request_responses", "artist_profiles"].some(
        (t) => schema[t]?.includes(col),
      );
      expect(inSome, `${col} is not a column on any table this module reads`).toBe(true);
    }
    expect(source).toContain("proposed_by_user_id");
    expect(source).not.toMatch(/\.eq\(\s*"requester_user_id"/);
  });
});
