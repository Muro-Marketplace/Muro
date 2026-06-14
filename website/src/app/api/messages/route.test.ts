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
  getSupabaseAdmin: () => ({ from: fromMock }),
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
