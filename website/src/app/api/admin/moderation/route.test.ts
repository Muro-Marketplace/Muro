// G27. Locks the /api/admin/moderation contract now that the queue has a
// decide path: GET validates its filters and parses payloads through the
// Phase 2.0d parser; PATCH records an approve/reject decision on a pending
// non-blog row, refuses blog rows (those go through /api/admin/blogs/[id]),
// refuses already-decided rows, and audits ids only, never free text.
//
// The real getAdminUser runs against a mocked Supabase, same as the
// curation route tests, so these exercise the actual predicate.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

import { GET, PATCH } from "./route";

// A variant-valid v4 UUID: zod's .uuid() checks the version and variant
// nibbles, so a "shaped like a UUID" string is rejected at the schema.
const QUEUE_ID = "11111111-2222-4333-8444-555555555555";

const MESSAGE_ROW = {
  id: QUEUE_ID,
  entity_type: "message",
  entity_id: "msg-1",
  submitted_by_user_id: "u-sender",
  submitted_by_email: "sender@example.com",
  status: "pending",
  decided_by_user_id: null,
  decided_at: null,
  reason: null,
  payload: {
    type: "message",
    message_id: "msg-1",
    conversation_id: "conv-1",
    sender_slug: "maya-chen",
    recipient_slug: "copper-kettle",
    flag_reason: "contact details",
    excerpt: "Call me on 07000 000000",
  },
  created_at: "2026-08-28T10:00:00.000Z",
};

function adminUsersChain() {
  return {
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  };
}

// One flexible moderation_queue mock: GET goes select > eq > eq > order >
// limit; PATCH reads via select > eq > maybeSingle and writes via
// update > eq > eq.
function moderationTable(opts: { rows?: unknown[]; row?: unknown } = {}) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: opts.rows ?? [], error: null }) }),
        }),
        maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: () => ({ eq: async () => updateMock(payload) }),
    }),
  };
}

function getReq(query: string, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request(`http://localhost/api/admin/moderation${query}`, { headers });
}

function patchReq(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/moderation", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  updateMock.mockReturnValue({ error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") return adminUsersChain();
    return moderationTable({ rows: [MESSAGE_ROW], row: MESSAGE_ROW });
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
});

describe("GET /api/admin/moderation", () => {
  it("rejects an unknown entity_type", async () => {
    const res = await GET(getReq("?entity_type=placement"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown status", async () => {
    const res = await GET(getReq("?entity_type=message&status=archived"));
    expect(res.status).toBe(400);
  });

  it("returns message rows with the payload run through the parser", async () => {
    const res = await GET(getReq("?entity_type=message&status=pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].payload).toEqual(MESSAGE_ROW.payload);
    expect(recordMock).toHaveBeenCalledWith({
      adminUserId: "u-admin",
      action: "moderation.read",
      context: { entity_type: "message", status: "pending", row_count: 1 },
    });
  });

  it("nulls a payload the parser rejects rather than passing it through", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return moderationTable({
        rows: [{ ...MESSAGE_ROW, payload: { type: "message", message_id: "msg-1" } }],
      });
    });
    const res = await GET(getReq("?entity_type=message&status=pending"));
    const body = await res.json();
    expect(body.rows[0].payload).toBeNull();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await GET(getReq("?entity_type=message"));
    expect(res.status).toBe(403);
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/moderation", () => {
  it("approves a pending message row and stamps the decision", async () => {
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
    expect(updateMock).toHaveBeenCalledTimes(1);
    const written = updateMock.mock.calls[0][0];
    expect(written.status).toBe("approved");
    expect(written.decided_by_user_id).toBe("u-admin");
    expect(written.decided_at).toBeTruthy();
    expect(written.reason).toBeUndefined();
  });

  it("records the reject reason on the row but keeps it out of the audit log", async () => {
    const res = await PATCH(
      patchReq({ id: QUEUE_ID, action: "reject", reason: "Threatening language towards the venue" }),
    );

    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0].reason).toBe("Threatening language towards the venue");
    expect(recordMock).toHaveBeenCalledTimes(1);
    const { context } = recordMock.mock.calls[0][0];
    expect(context).toEqual({
      queue_id: QUEUE_ID,
      entity_type: "message",
      entity_id: "msg-1",
      action: "reject",
    });
    expect(JSON.stringify(context)).not.toContain("Threatening");
  });

  it("rejects a malformed body at the schema", async () => {
    const res = await PATCH(patchReq({ id: "not-a-uuid", action: "approve" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("404s when the row does not exist", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return moderationTable({ row: null });
    });
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses blog rows, which are decided via /api/admin/blogs/[id]", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return moderationTable({ row: { ...MESSAGE_ROW, entity_type: "blog" } });
    });
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses a row that has already been decided", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return moderationTable({ row: { ...MESSAGE_ROW, status: "approved" } });
    });
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("records nothing when the update fails", async () => {
    updateMock.mockReturnValue({ error: { message: "permission denied" } });
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));
    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await PATCH(patchReq({ id: QUEUE_ID, action: "approve" }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
