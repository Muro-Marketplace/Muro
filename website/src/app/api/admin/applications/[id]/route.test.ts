import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, listUsersMock, inviteMock, updateUserMock, applicationsUpdateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(),
  inviteMock: vi.fn(),
  updateUserMock: vi.fn(),
  applicationsUpdateMock: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminUser: vi.fn(async () => ({
    user: { id: "u-admin", email: "admin@x.com", user_metadata: { user_type: "admin" } },
    error: null,
  })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: {
      admin: {
        listUsers: listUsersMock,
        inviteUserByEmail: inviteMock,
        updateUserById: updateUserMock,
        getUserById: vi.fn(),
      },
    },
  }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({})),
}));

import { PUT } from "./route";

beforeEach(() => {
  fromMock.mockReset();
  listUsersMock.mockReset();
  inviteMock.mockReset();
  updateUserMock.mockReset();
  applicationsUpdateMock.mockReset();
});

function req(body: unknown, id = "123"): Request {
  return new Request(`http://localhost/api/admin/applications/${id}`, {
    method: "PUT",
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/applications/[id] state guard", () => {
  it("refuses to act on an already-accepted application", async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: "123", status: "accepted" } }) }),
      }),
    }));
    const res = await PUT(req({ action: "reject", feedback: "x" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already/i);
  });

  it("refuses to act on a rejected application", async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: "123", status: "rejected" } }) }),
      }),
    }));
    const res = await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/admin/applications/[id] reviewed_at + reviewed_by", () => {
  // Builds a "from" mock that captures the update payload used on the
  // artist_applications table. Other tables (artist_profiles for the accept
  // path) use their own benign chains so the route can complete.
  function setupFromMockForReject(pendingApp: Record<string, unknown>) {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: pendingApp, error: null }) }),
          }),
          update: (payload: Record<string, unknown>) => {
            applicationsUpdateMock(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {};
    });
  }

  function setupFromMockForAccept(pendingApp: Record<string, unknown>) {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: pendingApp, error: null }) }),
          }),
          update: (payload: Record<string, unknown>) => {
            applicationsUpdateMock(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "artist_profiles") {
        return {
          // Referral-code uniqueness lookup — pretend the code is free.
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      return {};
    });
  }

  it("writes reviewed_at and reviewed_by on reject", async () => {
    setupFromMockForReject({
      id: "123",
      status: "pending",
      name: "Maya Chen",
      email: "maya@example.com",
    });

    const res = await PUT(req({ action: "reject" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);

    expect(applicationsUpdateMock).toHaveBeenCalledTimes(1);
    const payload = applicationsUpdateMock.mock.calls[0][0];
    expect(payload.status).toBe("rejected");
    expect(payload.reviewed_by).toBe("u-admin");
    expect(typeof payload.reviewed_at).toBe("string");
    expect(payload.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("writes reviewed_at and reviewed_by on accept", async () => {
    setupFromMockForAccept({
      id: "123",
      status: "pending",
      name: "Maya Chen",
      email: "maya@example.com",
      location: "London",
    });

    // Accept path looks up existing users; pretend the email is unknown so
    // the route uses the invite branch.
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    inviteMock.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const res = await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);

    expect(applicationsUpdateMock).toHaveBeenCalledTimes(1);
    const payload = applicationsUpdateMock.mock.calls[0][0];
    expect(payload.status).toBe("accepted");
    expect(payload.reviewed_by).toBe("u-admin");
    expect(typeof payload.reviewed_at).toBe("string");
    expect(payload.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
