// Phase 2.4 E1 + audit follow-up. Locks the artist-to-artist 403
// gate against GATING_V1, and verifies the flag-off path doesn't
// reject the same send. Skips the rest of the handler's deep paths
// because those are covered (indirectly) by the existing integration
// flows.
//
// Also covers remediation findings 1.4 and 4.2: admin gate for
// dispute-scoped reads and audit-before-return enforcement.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  fromMock,
  isFlagOnMock,
  sendEmailMock,
  isAdminMock,
  recordAdminActionMock,
  moderateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ ok: true })),
  isAdminMock: vi.fn(),
  recordAdminActionMock: vi.fn(),
  moderateMock: vi.fn(() => ({ allowed: true, flagged: false, reason: undefined as string | undefined })),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: isAdminMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    // The placement-response notification path reads the artist's auth user.
    // Without this the fixture threw and the outer catch reported 400, which
    // would have made a passing E33 guard look like a malformed body.
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
// K1: the legacy @/lib/email is deleted; both directions of the placement
// event go through sendEmail now.
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/messages/MessageUnreadNotification", () => ({
  MessageUnreadNotification: () => null,
}));
vi.mock("@/lib/moderation", () => ({ moderateMessage: moderateMock }));
vi.mock("@/lib/validations", () => ({
  messageSchema: {
    safeParse: (body: unknown) => ({ success: true, data: body }),
  },
}));
vi.mock("@/data/artists", () => ({ artists: [] }));
vi.mock("@/data/venues", () => ({ venues: [] }));
vi.mock("@/lib/admin-audit", () => ({
  recordAdminAction: recordAdminActionMock,
}));

import { POST, GET } from "./route";

function chainSelectMaybe(row: unknown) {
  // Self-referential, so any depth of .eq()/.or() (the user_blocks check
  // chains two .eq()s) resolves rather than TypeError-ing into the outer
  // catch and reading as a 400.
  const chain: Record<string, unknown> = {
    maybeSingle: async () => ({ data: row, error: null }),
    single: async () => ({ data: row, error: null }),
  };
  chain.eq = () => chain;
  chain.or = () => chain;
  return { select: () => chain };
}

beforeEach(() => {
  authMock.mockReset();
  fromMock.mockReset();
  isFlagOnMock.mockReset();
  sendEmailMock.mockClear();
  isAdminMock.mockReset();
  recordAdminActionMock.mockReset();
  moderateMock.mockReset();
  moderateMock.mockReturnValue({ allowed: true, flagged: false, reason: undefined });
  authMock.mockResolvedValue({ user: { id: "u-art-a", email: "a@example.com" }, error: null });
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/messages", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/messages — E1 artist-to-artist gating", () => {
  it("returns 403 when sender is artist, recipient is artist, AND GATING_V1 is on", async () => {
    isFlagOnMock.mockReturnValue(true);
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        // Both the sender slug lookup AND the recipient slug lookup
        // resolve to artist rows. Two separate calls but same shape.
        return chainSelectMaybe({ slug: "alice", user_id: "u-art-b" });
      }
      return chainSelectMaybe(null);
    });

    const res = await POST(
      req({
        conversationId: null,
        senderName: "alice",
        senderType: "artist",
        recipientSlug: "bob",
        content: "Hi",
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("artist_to_artist_blocked");
  });

  it("does NOT 403 the same send when GATING_V1 is off (flag-gated path)", async () => {
    isFlagOnMock.mockReturnValue(false);
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return chainSelectMaybe({ slug: "alice", user_id: "u-art-b" });
      }
      return chainSelectMaybe(null);
    });

    const res = await POST(
      req({
        conversationId: null,
        senderName: "alice",
        senderType: "artist",
        recipientSlug: "bob",
        content: "Hi",
      }),
    );
    // The handler continues past the E1 gate. It may still 4xx for
    // an unrelated reason (the test mocks aren't a full schema), but
    // a 403 with code=artist_to_artist_blocked would mean E1 fired
    // when the flag is off — that's the regression we're catching.
    if (res.status === 403) {
      const body = await res.json();
      expect(body.code).not.toBe("artist_to_artist_blocked");
    }
  });
});

// ── Dispute-scoped admin reads (findings 1.4 and 4.2) ──────────────────────

function getReq(disputeId: string): Request {
  return new Request(`http://localhost/api/messages?dispute_id=${disputeId}`, {
    headers: { authorization: "Bearer valid" },
  });
}

// Minimal fromMock setup for the dispute GET path.
function setupDisputeDb(conversationId: string | null) {
  fromMock.mockImplementation((table: string) => {
    if (table === "disputes") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: conversationId
                ? { id: "d-1", conversation_id: conversationId }
                : null,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "messages") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{ id: "m-1", content: "hello" }],
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("GET /api/messages?dispute_id — admin gate (1.4, 4.2)", () => {
  it("403 when isAdminRequest returns false", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-1", email: "x@x.com" }, error: null });
    setupDisputeDb("conv-1");

    const res = await GET(getReq("d-1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not authorised/i);
  });

  it("200 with messages when admin, and recordAdminAction is called", async () => {
    isAdminMock.mockResolvedValue(true);
    authMock.mockResolvedValue({ user: { id: "u-admin", email: "admin@x.com" }, error: null });
    recordAdminActionMock.mockResolvedValue(undefined);
    setupDisputeDb("conv-1");

    const res = await GET(getReq("d-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adminScopedToDispute).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "messages.read.dispute_scoped",
        context: expect.objectContaining({ dispute_id: "d-1" }),
      }),
    );
  });

  it("500 when recordAdminAction rejects (audit-before-return, 4.2)", async () => {
    isAdminMock.mockResolvedValue(true);
    authMock.mockResolvedValue({ user: { id: "u-admin", email: "admin@x.com" }, error: null });
    recordAdminActionMock.mockRejectedValue(new Error("DB down"));
    setupDisputeDb("conv-1");

    const res = await GET(getReq("d-1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/audit log failed/i);
  });
});

// ── E33: the unguarded placement_response branch (01 Phase C item 9) ────────
//
// placementId and status came straight off client-supplied metadata and were
// written with the service-role client, so RLS never intervened. Any account
// with a profile could accept or decline ANY placement by guessing an id, and
// notifyPlacementResponse then emailed the artist to say their venue had
// accepted. Prod has 33 pending placements, so this was live.
//
// These assert on whether the WRITE happened, not only on the status code. The
// route does a lot after this branch and the fixture is not a full schema; the
// security property is "no update reached placements", and that holds regardless.
describe("POST /api/messages placement_response authz (E33)", () => {
  type PlacementRow = {
    id: string;
    artist_user_id: string | null;
    venue_user_id: string | null;
    artist_slug: string | null;
    venue_slug: string | null;
    venue: string | null;
    status: string;
    proposed_by_user_id: string | null;
  };

  const updates: { payload: Record<string, unknown>; filters: Record<string, string> }[] = [];

  /**
   * `visible` is what assertPlacementParty's party-filtered read returns: pass
   * null to model "the caller is not a party", which is the exploit.
   */
  function setupPlacementDb(visible: PlacementRow | null, updateReturns: { id: string }[] = [{ id: "pl-1" }]) {
    updates.length = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "placements") {
        return {
          // assertPlacementParty: .select().eq("id").or(...).maybeSingle()
          select: () => ({
            eq: () => ({
              or: () => ({ maybeSingle: async () => ({ data: visible, error: null }) }),
              maybeSingle: async () => ({ data: visible, error: null }),
              single: async () => ({ data: visible, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            const filters: Record<string, string> = {};
            const chain = {
              eq: (col: string, val: string) => {
                filters[col] = val;
                return chain;
              },
              select: async () => {
                updates.push({ payload, filters });
                return { data: updateReturns, error: null };
              },
              then: (fn: (v: unknown) => unknown) => {
                updates.push({ payload, filters });
                return Promise.resolve({ data: updateReturns, error: null }).then(fn);
              },
            };
            return chain;
          },
        };
      }
      if (table === "artist_profiles" || table === "venue_profiles") {
        return chainSelectMaybe({ slug: "alice", user_id: "u-art-a", name: "Alice" });
      }
      return {
        // Self-referential chain so any depth of .eq() (the user_blocks check
        // chains two) resolves to "no row" rather than a TypeError.
        select: () => {
          const chain: Record<string, unknown> = {
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            or: () => chain,
            eq: () => chain,
          };
          return chain;
        },
        // The route now reads the inserted row's id back, so the notification
        // can key on the message instead of on Date.now(). A fake that returns
        // nothing makes every POST a 500.
        insert: () => ({
          select: () => ({ maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }) }),
        }),
        upsert: async () => ({ data: null, error: null }),
      };
    });
  }

  const PENDING: PlacementRow = {
    id: "pl-1",
    artist_user_id: "u-art-a",
    venue_user_id: "u-venue-b",
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "pending",
    proposed_by_user_id: null,
  };

  function responseReq(status: string, placementId = "pl-1") {
    return req({
      conversationId: "dm-alice__kings-arms",
      senderName: "alice",
      senderType: "artist",
      recipientSlug: "kings-arms",
      content: "ok",
      messageType: "placement_response",
      metadata: { placementId, status },
    });
  }

  beforeEach(() => {
    isFlagOnMock.mockReturnValue(false);
  });

  it("never writes when the caller is not a party to the placement", async () => {
    // The exploit: sweep ids from notification links and decline everything.
    setupPlacementDb(null);
    const res = await POST(responseReq("declined", "pl-someone-elses"));
    expect(updates, "a non-party reached the placements update").toEqual([]);
    expect(res.status).toBe(404);
    // AuthzError.toResponse() puts the code in `error` and prose in `message`.
    await expect(res.json()).resolves.toMatchObject({ error: "placement_not_found" });
  });

  it("refuses the known proposer answering their own request", async () => {
    setupPlacementDb({ ...PENDING, proposed_by_user_id: "u-art-a" });
    const res = await POST(responseReq("active"));
    expect(res.status).toBe(403);
    expect(updates).toEqual([]);
  });

  it("allows the counterparty when the proposer is someone else", async () => {
    setupPlacementDb({ ...PENDING, proposed_by_user_id: "u-venue-b" });
    await POST(responseReq("active"));
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ status: "active" });
  });

  it("still allows a response when the proposer is unknown, which is 84 of 86 live rows", async () => {
    // canRespond would refuse this, which is why it is not the gate here. The
    // party check is the security boundary; widening the requester rule is
    // Phase D item 10's effective-requester work.
    setupPlacementDb(PENDING);
    await POST(responseReq("declined"));
    expect(updates).toHaveLength(1);
  });

  it("compare-and-sets on pending so two concurrent responses cannot both land", async () => {
    setupPlacementDb(PENDING);
    await POST(responseReq("active"));
    expect(updates[0].filters).toMatchObject({ id: "pl-1", status: "pending" });
  });

  it("returns 409 when the row was already answered by the time we wrote", async () => {
    setupPlacementDb(PENDING, []); // update matched nothing
    const res = await POST(responseReq("active"));
    expect(res.status).toBe(409);
  });

  it("rejects an illegal transition instead of forcing it", async () => {
    setupPlacementDb({ ...PENDING, status: "completed" });
    const res = await POST(responseReq("active"));
    expect(res.status).toBe(422);
    expect(updates).toEqual([]);
  });

  it("surfaces the authz status rather than the bare catch's 400", async () => {
    // The POST catch used to swallow AuthzError and answer 400, which would
    // make a working guard indistinguishable from a malformed body.
    setupPlacementDb(null);
    const res = await POST(responseReq("declined"));
    expect(res.status).not.toBe(400);
  });
});


// Row 22's class, found in a second file (09 item 2.2's neighbourhood).
//
// The insert used to build an `extendedRow` and fall back to a `baseRow` "if
// the columns don't exist yet". The fallback was reachable, and for a specific
// reason: `flagged` and `flagged_reason` DO NOT EXIST on `messages` (checked
// against production and against schema-columns.json), while `message_type`,
// `metadata` and `attachments` all do. So a message that tripped the moderation
// filter carried two phantom columns, PostgREST rejected the whole insert, and
// the retry silently wrote the base row: a flagged PLACEMENT REQUEST was stored
// as a plain text message with no type and none of its negotiated terms, and
// nothing errored.
describe("POST /api/messages writes ONE row, with everything on it", () => {
  const inserts: Record<string, unknown>[] = [];
  const queueInserts: Record<string, unknown>[] = [];

  /** The real `messages` columns, from the committed schema snapshot. */
  const MESSAGE_COLUMNS = new Set<string>(
    (
      JSON.parse(
        readFileSync(path.resolve(__dirname, "../../../../tests/integration/schema-columns.json"), "utf8"),
      ) as Record<string, string[]>
    ).messages,
  );

  function setupInsertDb(opts: { insertError?: unknown; queueError?: unknown; recipientBlocksSender?: boolean } = {}) {
    inserts.length = 0;
    fromMock.mockImplementation((table: string) => {
      // Sender and recipient both resolve, or the route 404s the recipient
      // before it ever reaches the insert this describe block is about.
      if (table === "artist_profiles") return chainSelectMaybe(null);
      if (table === "venue_profiles") {
        return chainSelectMaybe({ slug: "alice", user_id: "u-venue", name: "Alice" });
      }
      if (table === "moderation_queue") {
        return {
          insert: async (row: Record<string, unknown>) => {
            queueInserts.push(row);
            return { error: opts.queueError ?? null };
          },
        };
      }
      if (table === "user_blocks") {
        return chainSelectMaybe(opts.recipientBlocksSender ? { blocked_slug: "alice" } : null);
      }
      if (table === "messages") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            // PostgREST rejects the WHOLE statement when a row names a column
            // the table lacks. Modelling that is the point: without it this
            // suite asserts the shape of a row rather than reproducing the
            // failure the shape caused.
            const unknown = Object.keys(row).filter((k) => !MESSAGE_COLUMNS.has(k));
            const error = unknown.length
              ? { code: "PGRST204", message: `Could not find the '${unknown[0]}' column of 'messages'` }
              : (opts.insertError ?? null);
            return {
              select: () => ({
                maybeSingle: async () =>
                  error ? { data: null, error } : { data: { id: "msg-42" }, error: null },
              }),
            };
          },
        };
      }
      return chainSelectMaybe(null);
    });
  }

  function send(body: Record<string, unknown> = {}) {
    return POST(
      req({
        conversationId: "conv-1",
        senderName: "alice",
        senderType: "venue",
        recipientSlug: "bob",
        content: "Hello there, this is a message.",
        ...body,
      }),
    );
  }

  beforeEach(() => {
    isFlagOnMock.mockReturnValue(false);
    queueInserts.length = 0;
    setupInsertDb();
  });

  it("keeps message_type, metadata and attachments on a FLAGGED message", async () => {
    // THE regression. Under the old code this row lost all three.
    moderateMock.mockReturnValue({ allowed: true, flagged: true, reason: "spammy link" });

    await send({
      messageType: "placement_request",
      metadata: { arrangementType: "paid_loan", monthlyFeeGbp: 40 },
      attachments: [{ url: "https://x/a.png" }],
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      message_type: "placement_request",
      attachments: [{ url: "https://x/a.png" }],
    });
    expect(inserts[0].metadata).toMatchObject({ arrangementType: "paid_loan", monthlyFeeGbp: 40 });
  });

  it("records the flag in metadata, which is a column that exists", async () => {
    moderateMock.mockReturnValue({ allowed: true, flagged: true, reason: "spammy link" });

    await send();

    expect(inserts[0].metadata).toMatchObject({
      moderation_flagged: true,
      moderation_reason: "spammy link",
    });
  });

  it("never sends a column the messages table does not have", async () => {
    // `flagged` and `flagged_reason` are the two that were being sent. Naming
    // them keeps this test about the actual defect rather than about shape.
    moderateMock.mockReturnValue({ allowed: true, flagged: true, reason: "spammy link" });

    await send();

    expect(Object.keys(inserts[0])).not.toContain("flagged");
    expect(Object.keys(inserts[0])).not.toContain("flagged_reason");
  });

  it("adds nothing to metadata when the message is not flagged", async () => {
    await send({ metadata: { arrangementType: "purchase" } });

    expect(inserts[0].metadata).toEqual({ arrangementType: "purchase" });
  });

  it("puts a FLAGGED message in the moderation queue (owner decision 11)", async () => {
    // 09 item 2.2 made the flag survive on the row; until migration 116 there
    // was still no queue member for messages, so no admin ever saw it.
    moderateMock.mockReturnValue({ allowed: true, flagged: true, reason: "spammy link" });

    await send({ content: "Buy cheap prints at dodgy.example right now please" });

    expect(queueInserts).toHaveLength(1);
    expect(queueInserts[0]).toMatchObject({
      entity_type: "message",
      entity_id: "msg-42",
      status: "pending",
    });
    expect(queueInserts[0].payload).toMatchObject({
      type: "message",
      message_id: "msg-42",
      flag_reason: "spammy link",
    });
  });

  it("keeps a clean message out of the queue", async () => {
    await send();
    expect(queueInserts).toHaveLength(0);
  });

  it("still delivers the message when the queue insert fails", async () => {
    // Moderation visibility must not block delivery: the flag survives on the
    // row regardless.
    moderateMock.mockReturnValue({ allowed: true, flagged: true, reason: "spammy link" });
    setupInsertDb({ queueError: { message: "queue down" } });

    await send();

    // The message row landed; the queue attempt was made and its failure did
    // not become a second message insert or a dropped delivery.
    expect(inserts).toHaveLength(1);
    expect(queueInserts).toHaveLength(1);
  });

  it("attempts the insert exactly ONCE, and surfaces a failure", async () => {
    // The strip-and-retry turned a real error into a quieter, lesser write.
    setupInsertDb({ insertError: { message: "permission denied" } });

    const res = await send();

    expect(inserts).toHaveLength(1);
    expect(res.status).toBe(500);
  });
});


// Owner decision 16. `user_blocks` was recorded (migration 111) and read by
// NOTHING, so a person who blocked someone was told it worked while the blocked
// account could still message them. The send path now honours it.
describe("POST /api/messages honours the recipient's block", () => {
  const insertsSeen: Record<string, unknown>[] = [];

  function setupBlockDb(blocked: boolean) {
    insertsSeen.length = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") return chainSelectMaybe(null);
      if (table === "venue_profiles") {
        return chainSelectMaybe({ slug: "alice", user_id: "u-venue", name: "Alice" });
      }
      if (table === "user_blocks") {
        return chainSelectMaybe(blocked ? { blocked_slug: "alice" } : null);
      }
      if (table === "messages") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: (row: Record<string, unknown>) => {
            insertsSeen.push(row);
            return {
              select: () => ({ maybeSingle: async () => ({ data: { id: "msg-9" }, error: null }) }),
            };
          },
        };
      }
      return chainSelectMaybe(null);
    });
  }

  function sendMsg() {
    return POST(
      req({
        conversationId: "conv-1",
        senderName: "alice",
        senderType: "venue",
        recipientSlug: "bob",
        content: "Hello there, message content here.",
      }),
    );
  }

  beforeEach(() => isFlagOnMock.mockReturnValue(false));

  it("refuses the send BEFORE any insert when the recipient has blocked the sender", async () => {
    setupBlockDb(true);

    const res = await sendMsg();

    expect(res.status).toBe(403);
    expect(insertsSeen).toHaveLength(0);
  });

  it("refuses with neutral copy that does not say 'blocked'", async () => {
    // Telling a harasser they are blocked invites the workaround account.
    setupBlockDb(true);
    const body = await (await sendMsg()).json();
    expect(JSON.stringify(body).toLowerCase()).not.toContain("block");
  });

  it("delivers normally when no block exists", async () => {
    setupBlockDb(false);
    await sendMsg();
    expect(insertsSeen).toHaveLength(1);
  });
});


// Owner decision 16, inbox half: a conversation with someone the VIEWER has
// blocked disappears from their list.
describe("GET /api/messages honours the viewer's blocks", () => {
  function setupInboxDb(opts: { blocked: string[] }) {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        // Ownership check resolves the viewer's slug; enrichment .in() returns [].
        const chain: Record<string, unknown> = {
          single: async () => ({ data: { slug: "alice" }, error: null }),
          maybeSingle: async () => ({ data: { slug: "alice" }, error: null }),
          in: async () => ({ data: [], error: null }),
        };
        chain.eq = () => chain;
        return { select: () => chain };
      }
      if (table === "user_blocks") {
        const chain: Record<string, unknown> = {};
        chain.eq = async () => ({
          data: opts.blocked.map((slug) => ({ blocked_slug: slug })),
          error: null,
        });
        return { select: () => chain };
      }
      if (table === "messages") {
        const chain: Record<string, unknown> = {
          order: async () => ({
            data: [
              { conversation_id: "c-bob", sender_name: "bob", recipient_slug: "alice", content: "hi", sender_type: "artist", is_read: false, created_at: "2026-08-01" },
              { conversation_id: "c-carol", sender_name: "carol", recipient_slug: "alice", content: "yo", sender_type: "artist", is_read: false, created_at: "2026-08-02" },
            ],
            error: null,
          }),
        };
        chain.or = () => chain;
        chain.eq = () => chain;
        return { select: () => chain };
      }
      // venue_profiles enrichment, placements: empty.
      const chain: Record<string, unknown> = {
        in: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
      };
      chain.eq = () => chain;
      chain.or = async () => ({ data: [], error: null });
      return { select: () => chain };
    });
  }

  function getReqSlug(): Request {
    return new Request("http://localhost/api/messages?slug=alice", {
      headers: { authorization: "Bearer valid" },
    });
  }

  it("filters out conversations with a blocked party", async () => {
    setupInboxDb({ blocked: ["bob"] });

    const body = await (await GET(getReqSlug())).json();
    const parties = (body.conversations as { otherParty: string }[]).map((c) => c.otherParty);

    expect(parties).toContain("carol");
    expect(parties).not.toContain("bob");
  });

  it("leaves the inbox whole when nothing is blocked", async () => {
    setupInboxDb({ blocked: [] });

    const body = await (await GET(getReqSlug())).json();

    expect((body.conversations as unknown[]).length).toBe(2);
  });
});
