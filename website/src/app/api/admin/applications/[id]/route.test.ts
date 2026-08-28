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

// E30a: the route now goes through `withAdmin`, which owns the audit write so a
// handler cannot forget it. Stood in faithfully here (resolve an admin, run the
// handler, record what `audit()` was called with) so these tests stay about the
// route's behaviour. The wrapper's own contract is tested in admin-auth.test.ts.
const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn() }));

const ADMIN = { id: "u-admin", email: "admin@x.com", user_metadata: { user_type: "admin" } };

vi.mock("@/lib/admin-auth", () => ({
  getAdminUser: vi.fn(async () => ({ user: ADMIN, error: null })),
  withAdmin: async (
    _request: Request,
    action: string,
    handler: (ctx: {
      user: typeof ADMIN;
      audit: (context?: Record<string, unknown>, actionOverride?: string) => void;
    }) => Promise<Response>,
  ) =>
    handler({
      user: ADMIN,
      audit: (context, actionOverride) =>
        auditMock({ action: actionOverride ?? action, context }),
    }),
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

describe("PUT /api/admin/applications/[id] surfaces a failed status flip", () => {
  // The original update had no error check, so a failure left status='pending'
  // and the admin list kept showing the applicant as awaiting review after
  // Accept was clicked. That check is what matters and it is still here.
  //
  // The strip-and-retry that WAS here is deleted, and this test is inverted with
  // it. It dropped `reviewed_at` and `reviewed_by` "for a legacy schema"; both
  // columns exist in production (migration 052, confirmed against the live
  // schema), so the branch could never fire for the reason it claimed. If it
  // ever had, it would have discarded the audit trail on an admin decision and
  // reported success — the same class as migration 109's, which destroyed a
  // referral code on every application.
  it("does NOT retry without the audit columns, and reports the failure instead", async () => {
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

    // A rejected update is a failure, not something to work around. Reporting
    // 200 with a half-written row is how an admin comes to believe a decision
    // was recorded when it was not.
    expect(res.status).toBe(500);

    // ONE attempt, carrying the audit columns. A second, leaner one would mean
    // the accept was recorded without who did it or when.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveProperty("reviewed_at");
    expect(calls[0]).toHaveProperty("reviewed_by");
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


// E30a / G1 — the admission gate left no audit trail at all. It creates or
// invites an auth user, rewrites that user's user_metadata, inserts an
// approved artist_profiles row and flips the application status.
describe("PUT /api/admin/applications/[id] writes an audit row (E30a)", () => {
  const APP = {
    id: "123",
    status: "pending",
    name: "Finlay Coles",
    email: "finlay@example.com",
    location: "London",
    artist_statement: "a long statement that must not reach the audit context",
    portfolio_link: "https://example.com/portfolio",
  };

  function mockApplication(app: Record<string, unknown>) {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: app, error: null }) }) }),
          update: (payload: Record<string, unknown>) => {
            applicationsUpdateMock(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
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
    auditMock.mockReset();
    mockApplication(APP);
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    inviteMock.mockResolvedValue({ data: { user: { id: "new-user-id" } }, error: null });
    updateUserMock.mockResolvedValue({ data: null, error: null });
  });

  const put = (body: unknown) =>
    PUT(req(body), { params: Promise.resolve({ id: "123" }) });

  it("records an application_accepted decision naming the target, not the row", async () => {
    const res = await put({ action: "accept" });
    expect(res.status).toBe(200);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const { action, context } = auditMock.mock.calls[0][0];
    expect(action).toBe("application_accepted");
    expect(context).toMatchObject({
      applicationId: "123",
      applicantEmail: "finlay@example.com",
      decision: "accepted",
    });
    // Keep the JSONB column from accumulating PII: the decision and the
    // target, never the application body.
    expect(context).not.toHaveProperty("artist_statement");
    expect(context).not.toHaveProperty("portfolio_link");
  });

  it("records an application_rejected decision", async () => {
    const res = await put({ action: "reject", feedback: "not a fit" });
    expect(res.status).toBe(200);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const { action, context } = auditMock.mock.calls[0][0];
    expect(action).toBe("application_rejected");
    expect(context).toMatchObject({
      applicationId: "123",
      applicantEmail: "finlay@example.com",
      decision: "rejected",
    });
  });

  it("records nothing when the application is not pending", async () => {
    // A refused request changed nothing, so there is nothing to account for.
    mockApplication({ ...APP, status: "accepted" });
    const res = await put({ action: "accept" });
    expect(res.status).toBe(409);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("records nothing for an invalid action", async () => {
    const res = await put({ action: "delete-everything" });
    expect(res.status).toBe(400);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// G5/H2 (WS8 item 5). Accepting an application for an EXISTING account sent a
// fresh three-key user_metadata that force-flipped user_type to "artist": a
// venue (or admin) who also applied as an artist silently lost their portal.
// The route now spreads the existing metadata and never demotes a role.
describe("PUT /api/admin/applications/[id] merges metadata on accept (G5/H2)", () => {
  const APP = {
    id: "123",
    status: "pending",
    name: "Maya Chen",
    email: "maya@example.com",
    location: "London",
  };

  function setupTables() {
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_applications") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: APP, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {};
    });
  }

  function acceptWithExistingUser(user_metadata: Record<string, unknown>) {
    setupTables();
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "existing-user-id", email: "maya@example.com", user_metadata }] },
      error: null,
    });
    updateUserMock.mockResolvedValue({ data: null, error: null });
    return PUT(req({ action: "accept" }), { params: Promise.resolve({ id: "123" }) });
  }

  it("keeps a venue's role and unrelated keys, adds the artist slug", async () => {
    const res = await acceptWithExistingUser({
      user_type: "venue",
      display_name: "Kings Arms",
      first_name: "Maya",
    });
    expect(res.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateUserMock.mock.calls[0];
    expect(payload.user_metadata).toMatchObject({
      user_type: "venue", // never demoted
      display_name: "Kings Arms", // existing name kept
      first_name: "Maya", // unrelated key survives the write
      artist_slug: "maya-chen",
    });
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it("keeps an admin's role", async () => {
    await acceptWithExistingUser({ user_type: "admin" });
    const [, payload] = updateUserMock.mock.calls[0];
    expect(payload.user_metadata.user_type).toBe("admin");
  });

  it("promotes a customer to artist, since becoming an artist is the point of applying", async () => {
    await acceptWithExistingUser({ user_type: "customer", first_name: "Maya" });
    const [, payload] = updateUserMock.mock.calls[0];
    expect(payload.user_metadata).toMatchObject({
      user_type: "artist",
      first_name: "Maya",
    });
  });

  it("stamps artist and the application name on a role-less account", async () => {
    await acceptWithExistingUser({});
    const [, payload] = updateUserMock.mock.calls[0];
    expect(payload.user_metadata).toMatchObject({
      user_type: "artist",
      display_name: "Maya Chen",
      artist_slug: "maya-chen",
    });
  });
});
