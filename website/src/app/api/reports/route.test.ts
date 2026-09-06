// Nothing could be reported except a conversation.
//
// `POST /api/messages/report` has existed since #20 and writes
// `conversation_reports`. The marketplace's primary content, the artwork images
// and the profiles around them, had no report path at all: the `reports` table
// was created by migration 060 with an index on
// (reported_entity_type, reported_entity_id) and a comment saying "no code
// reads/writes these yet", and five months later that was still true.
//
// This pins the four things that make a report worth having: it persists, it
// resolves the reported owner server-side rather than trusting the client, a
// failed write is reported as a failure rather than as success, and somebody
// is told.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock, sendAdminAlertMock, rateLimitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  rateLimitMock: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { POST } from "./route";

let inserted: Record<string, unknown> | null = null;

interface DbOpts {
  /**
   * The entity row the lookup finds, or null for "not found". Shaped like the
   * real tables, verified against information_schema on 2026-09-06:
   * artist_works has artist_id + title and NO user_id; artist_collections has
   * artist_id + name; the two profile tables have user_id + name.
   */
  entity?: Record<string, unknown> | null;
  /** The artist_profiles row the second hop finds, for works and collections. */
  profile?: { user_id: string | null } | null;
  insertError?: unknown;
  rowId?: string | null;
}

/** Every table the fake was asked for, so a wrong table name fails loudly. */
let tablesQueried: string[] = [];
/** Every column list the fake was asked for, so a wrong column fails loudly. */
let selects: string[] = [];

function installDb({
  entity = { artist_id: "artist-row-1", title: "Still Life" },
  profile = { user_id: "owner-1" },
  insertError = null,
  rowId = "rep-1",
}: DbOpts = {}) {
  inserted = null;
  tablesQueried = [];
  selects = [];
  fromMock.mockImplementation((table: string) => {
    tablesQueried.push(table);
    if (table === "reports") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserted = row;
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: insertError ? null : rowId ? { id: rowId } : null,
                error: insertError,
              }),
            }),
          };
        },
      };
    }
    return {
      select: (cols: string) => {
        selects.push(`${table}:${cols}`);
        return {
          eq: () => ({
            maybeSingle: async () => ({
              // The second hop is the only artist_profiles read that follows an
              // entity read, so it is distinguished by having been asked for
              // user_id alone.
              data: cols === "user_id" ? profile : entity,
              error: null,
            }),
          }),
        };
      },
    };
  });
}

function post(body: unknown) {
  return POST(new Request("https://x/api/reports", { method: "POST", body: JSON.stringify(body) }));
}

const VALID = { entityType: "artist_work", entityId: "11111111-1111-1111-1111-111111111111", reason: "offensive_or_explicit", detail: "Explicit imagery" };

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockResolvedValue(null);
  getAuthMock.mockResolvedValue({ user: { id: "reporter-1", email: "r@example.com" }, error: null });
  installDb();
});

describe("POST /api/reports", () => {
  it("requires authentication, because reports.reporter_user_id is NOT NULL", async () => {
    const unauth = new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
    getAuthMock.mockResolvedValue({ user: null, error: unauth });
    const res = await post(VALID);
    expect(res.status).toBe(401);
    expect(inserted).toBeNull();
  });

  it("honours the rate limit before doing any work", async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const res = await post(VALID);
    expect(res.status).toBe(429);
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown entity type", async () => {
    const res = await post({ ...VALID, entityType: "blog_post" });
    expect(res.status).toBe(400);
    expect(inserted).toBeNull();
  });

  it("rejects an unknown reason", async () => {
    const res = await post({ ...VALID, reason: "because" });
    expect(res.status).toBe(400);
    expect(inserted).toBeNull();
  });

  it("404s when the reported entity does not exist, rather than storing a report about nothing", async () => {
    installDb({ entity: null });
    const res = await post(VALID);
    expect(res.status).toBe(404);
    expect(inserted).toBeNull();
  });

  it("stores the report with the owner resolved SERVER-SIDE, never from the body", async () => {
    const res = await post({ ...VALID, reportedUserId: "someone-else-entirely" });
    expect(res.status).toBe(200);
    expect(inserted).toMatchObject({
      reporter_user_id: "reporter-1",
      reported_user_id: "owner-1",
      reported_entity_type: "artist_work",
      reported_entity_id: VALID.entityId,
    });
    expect(Object.keys(inserted!)).not.toContain("reportedUserId");
  });

  it("carries the reason code and the detail into the stored reason", async () => {
    await post(VALID);
    expect(String(inserted!.reason)).toContain("offensive_or_explicit");
    expect(String(inserted!.reason)).toContain("Explicit imagery");
  });

  it("refuses a self-report, so the queue cannot be filled with your own work", async () => {
    installDb({ profile: { user_id: "reporter-1" } });
    const res = await post(VALID);
    expect(res.status).toBe(400);
    expect(inserted).toBeNull();
  });

  it("reports a failed write as a failure, not as success", async () => {
    installDb({ insertError: { message: "boom" } });
    const res = await post(VALID);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("alerts an admin, keyed on the stored row so a retry cannot double-post", async () => {
    await post(VALID);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const arg = (sendAdminAlertMock.mock.calls[0] as unknown as [{ idempotencyKey: string; actionPath: string }])[0];
    expect(arg.idempotencyKey).toBe("admin_content_report:rep-1");
    expect(arg.actionPath).toBe("/admin/moderation");
  });

  it("still stores the report when the admin alert throws", async () => {
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(inserted).not.toBeNull();
  });

  it("accepts a profile report, where the id is a slug rather than a uuid", async () => {
    installDb({ entity: { user_id: "venue-owner", name: "The Curzon" } });
    const res = await post({ entityType: "venue_profile", entityId: "the-curzon", reason: "impersonation" });
    expect(res.status).toBe(200);
    expect(inserted).toMatchObject({ reported_entity_type: "venue_profile", reported_entity_id: "the-curzon" });
  });
});

describe("owner resolution reads the columns that actually exist", () => {
  // The first version of this route asked artist_works for a `user_id` it does
  // not have, and artist_collections for a `title` it calls `name`. Both were
  // invisible because the fake answered any column with the same object. These
  // assert the real column names, verified against information_schema.
  it("resolves an artwork through artist_id, then artist_profiles.user_id", async () => {
    await post(VALID);
    expect(tablesQueried).toEqual(["artist_works", "artist_profiles", "reports"]);
    expect(selects).toEqual(["artist_works:artist_id, title", "artist_profiles:user_id"]);
    expect(inserted).toMatchObject({ reported_user_id: "owner-1" });
  });

  it("asks artist_collections for `name`, not `title`", async () => {
    installDb({ entity: { artist_id: "artist-row-1", name: "Winter Series" } });
    const res = await post({ entityType: "collection", entityId: "c-1", reason: "spam" });
    expect(res.status).toBe(200);
    expect(selects).toEqual(["artist_collections:artist_id, name", "artist_profiles:user_id"]);
  });

  it("reads a venue profile in one hop, off user_id and name", async () => {
    installDb({ entity: { user_id: "venue-owner", name: "The Curzon" } });
    await post({ entityType: "venue_profile", entityId: "the-curzon", reason: "impersonation" });
    expect(tablesQueried).toEqual(["venue_profiles", "reports"]);
    expect(selects).toEqual(["venue_profiles:user_id, name"]);
  });

  it("still records the report when the work has no artist_id, rather than 404ing a real work", async () => {
    installDb({ entity: { artist_id: null, title: "Orphaned" } });
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(inserted).toMatchObject({ reported_user_id: null, reported_entity_type: "artist_work" });
  });
});
