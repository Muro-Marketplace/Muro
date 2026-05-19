import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  fromMock,
  listUsersMock,
  inviteMock,
  updateUserMock,
  applicationsUpdateMock,
  profilesInsertMock,
  profilesUpdateMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(),
  inviteMock: vi.fn(),
  updateUserMock: vi.fn(),
  applicationsUpdateMock: vi.fn(),
  profilesInsertMock: vi.fn(),
  profilesUpdateMock: vi.fn(),
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
  profilesInsertMock.mockReset();
  profilesUpdateMock.mockReset();
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
          insert: async (payload: Record<string, unknown>) => {
            profilesInsertMock(payload);
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => {
            profilesUpdateMock(payload);
            return { eq: async () => ({ error: null }) };
          },
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

describe("PUT /api/admin/applications/[id] sets review_status='approved' on accept", () => {
  // Regression: migration 036 flipped the artist_profiles.review_status
  // default from 'approved' to 'pending'. The accept route was inserting
  // the new profile WITHOUT specifying review_status, so freshly-accepted
  // artists landed at 'pending' and were invisible to the public
  // marketplace (RLS + getAllDatabaseArtists both filter on 'approved').
  // Symptom: venue couldn't request a placement to the newly-accepted
  // artist because /api/browse-artists never returned them.
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
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
          insert: async (payload: Record<string, unknown>) => {
            profilesInsertMock(payload);
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => {
            profilesUpdateMock(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {};
    });
  }

  beforeEach(() => {
    setupFromMockForAccept({
      id: "123",
      status: "pending",
      name: "Finlay Coles",
      email: "finlay@example.com",
      location: "London",
    });
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    inviteMock.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });
  });

  it("the artist_profiles INSERT carries review_status='approved' + approved_at", async () => {
    const res = await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);

    expect(profilesInsertMock).toHaveBeenCalledTimes(1);
    const payload = profilesInsertMock.mock.calls[0][0];
    expect(payload.review_status).toBe("approved");
    expect(typeof payload.approved_at).toBe("string");
    expect(payload.approved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("runs a belt-and-braces UPDATE so existing-user / silent-insert-failure paths also flip to approved", async () => {
    // Even if the INSERT silently no-ops (existing-user branch, unique
    // violation on a pre-existing row, future migration drifting the
    // default again), the follow-up UPDATE guarantees the profile lands
    // approved. The route doesn't fail the operation on insert errors
    // by design — see the comment around `profileError` — so this UPDATE
    // is the actual source of truth.
    await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });

    expect(profilesUpdateMock).toHaveBeenCalledTimes(1);
    const payload = profilesUpdateMock.mock.calls[0][0];
    expect(payload.review_status).toBe("approved");
    expect(typeof payload.approved_at).toBe("string");
  });
});

describe("PUT /api/admin/applications/[id] missing reviewed_at column fallback", () => {
  // Regression: migration 052 added reviewed_at + reviewed_by to
  // artist_applications. Production envs that haven't run it yet would
  // silently fail the .update() with a "column does not exist" PostgREST
  // error and leave status='pending', so the admin list still showed the
  // application as awaiting review even after Accept was clicked. The
  // updateApplicationStatus helper now retries with the bare {status}
  // payload when the failure mentions reviewed_at/reviewed_by, so the
  // status flip survives a missing-migration deployment.
  it("retries with status-only payload when reviewed_at column is missing on accept", async () => {
    const calls: Record<string, unknown>[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "123",
                  status: "pending",
                  name: "Finlay",
                  email: "finlay@example.com",
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            calls.push(payload);
            return {
              eq: async () => {
                // First call carries reviewed_at, simulate the legacy
                // schema rejecting it; second call should be a bare retry.
                if (Object.keys(payload).includes("reviewed_at")) {
                  return {
                    error: {
                      message:
                        "column artist_applications.reviewed_at does not exist",
                    },
                  };
                }
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {};
    });
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    inviteMock.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const res = await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);

    // First call carried the metadata, the retry stripped it down to
    // {status: "accepted"} so the status flip lands even on the legacy
    // schema.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toHaveProperty("reviewed_at");
    expect(calls[calls.length - 1]).toEqual({ status: "accepted" });
  });

  it("returns 500 with a meaningful error when the application update fails for non-column reasons", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "123",
                  status: "pending",
                  name: "Finlay",
                  email: "finlay@example.com",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({
              error: { message: "permission denied for table" },
            }),
          }),
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {};
    });
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    inviteMock.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const res = await PUT(req({ action: "accept" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed/i);
  });
});

describe("PUT /api/admin/applications/[id] reject also flips artist_profiles.review_status", () => {
  // /api/apply now pre-creates an artist_profiles bridge row with
  // review_status='pending'. Without this sync, a rejected applicant
  // would still see the under-review banner on the artist portal
  // (PortalGuard reads artist_profiles.review_status, not the
  // artist_applications.status). Mirror the reject onto the profile so
  // the portal lands on the "Application not approved" screen.
  it("updates artist_profiles.review_status to 'rejected' when the user exists", async () => {
    const profilesUpdatePayloads: Record<string, unknown>[] = [];
    const profilesUpdateWhere: Record<string, unknown>[] = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "123",
                  status: "pending",
                  name: "Finlay",
                  email: "finlay@example.com",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "artist_profiles") {
        return {
          update: (payload: Record<string, unknown>) => {
            profilesUpdatePayloads.push(payload);
            return {
              eq: async (col: string, val: unknown) => {
                profilesUpdateWhere.push({ col, val });
                return { error: null };
              },
            };
          },
        };
      }
      return {};
    });

    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "existing-user-id", email: "finlay@example.com" }] },
      error: null,
    });

    const res = await PUT(req({ action: "reject" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);

    expect(profilesUpdatePayloads).toContainEqual({ review_status: "rejected" });
    expect(profilesUpdateWhere).toContainEqual({
      col: "user_id",
      val: "existing-user-id",
    });
  });

  it("skips the profile sync gracefully when no auth user matches the application email", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "123",
                  status: "pending",
                  name: "Finlay",
                  email: "finlay@example.com",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "artist_profiles") {
        return {
          update: () => ({
            eq: async () => {
              throw new Error("should not be called");
            },
          }),
        };
      }
      return {};
    });

    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });

    const res = await PUT(req({ action: "reject" }), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(200);
  });
});
