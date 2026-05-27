// Phase 2.4 E1 + audit follow-up. Locks the artist-to-artist 403
// gate against GATING_V1, and verifies the flag-off path doesn't
// reject the same send. Skips the rest of the handler's deep paths
// because those are covered (indirectly) by the existing integration
// flows.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  fromMock,
  isFlagOnMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
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

import { POST } from "./route";

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
