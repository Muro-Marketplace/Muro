// Phase 2.4 E1 + audit follow-up. Locks the artist-to-artist 403
// gate against GATING_V1, and verifies the flag-off path doesn't
// reject the same send. Skips the rest of the handler's deep paths
// because those are covered (indirectly) by the existing integration
// flows.
//
// Also covers remediation findings 1.4 and 4.2: admin gate for
// dispute-scoped reads and audit-before-return enforcement.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  fromMock,
  isFlagOnMock,
  sendEmailMock,
  isAdminMock,
  recordAdminActionMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ ok: true })),
  isAdminMock: vi.fn(),
  recordAdminActionMock: vi.fn(),
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
vi.mock("@/lib/email", () => ({
  notifyPlacementRequest: vi.fn(async () => {}),
  notifyPlacementResponse: vi.fn(async () => {}),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/messages/MessageUnreadNotification", () => ({
  MessageUnreadNotification: () => null,
}));
vi.mock("@/lib/moderation", () => ({
  moderateMessage: () => ({ allowed: true, flagged: false }),
}));
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
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: row, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  fromMock.mockReset();
  isFlagOnMock.mockReset();
  sendEmailMock.mockClear();
  isAdminMock.mockReset();
  recordAdminActionMock.mockReset();
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
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            or: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
        insert: async () => ({ data: null, error: null }),
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
