// G8. The artists admin surface was a read-only table: the list did not even
// select review_status, so an admin could not see whether a profile was live on
// the marketplace, and there was no write path at all. Taking a profile down
// meant editing the row in Supabase by hand.
//
// Two operational templates had been written, styled and registered for exactly
// this and were sent by nothing: OperationalAccountRestricted and
// OperationalAccountRestored.
//
// Task 8 / Step 2 folded a second payload shape into the same PATCH: the
// founding-cohort toggle. `is_founding_artist` sits on
// ARTIST_PROFILE_SERVER_OWNED (lib/db/writable-fields.ts) so no artist-facing
// route can set it, which makes this the only write path, and the flyer's
// "First 20 artists: 6 months free" claim depends on the count guard actually
// refusing the 21st. Its tests are the second describe block below; they use
// their own fromMock wiring because the count check is a head:true query the
// review-status tests do not model.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, getUserById, fromMock, recordMock, sendEmailMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  sendEmailMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser, admin: { getUserById } },
    from: fromMock,
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { GET, PATCH } from "./route";

const ARTIST = {
  id: "ap-1",
  user_id: "u-artist",
  slug: "maya-chen",
  name: "Maya Chen",
  primary_medium: "Oil",
  location: "London",
  review_status: "approved",
  approved_at: "2026-05-01T09:00:00.000Z",
  created_at: "2026-04-01T09:00:00.000Z",
};

let selectedColumns = "";

function adminUsersChain() {
  return {
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  };
}

function artistsTable(row: unknown = ARTIST) {
  return {
    select: (cols: string) => {
      selectedColumns = cols;
      return {
        order: async () => ({ data: [ARTIST], error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      };
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async () => updateMock(payload),
    }),
  };
}

function req(method: string, body?: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/artists", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  getUser.mockReset();
  getUserById.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  sendEmailMock.mockReset();
  updateMock.mockReset();
  selectedColumns = "";

  process.env.ADMIN_EMAILS = "boss@example.com";
  process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
  updateMock.mockResolvedValue({ error: null });
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m1" });
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") return adminUsersChain();
    return artistsTable();
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  getUserById.mockResolvedValue({
    data: { user: { id: "u-artist", email: "maya@example.com", user_metadata: { display_name: "Maya Chen" } } },
    error: null,
  });
});

describe("G8: the list says whether a profile is live", () => {
  it("selects review_status so the page can show it", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(selectedColumns).toContain("review_status");
  });

  it("returns it on every row", async () => {
    const res = await GET(req("GET"));
    const body = await res.json();
    expect(body.artists[0].review_status).toBe("approved");
  });
});

describe("G8: taking a profile down", () => {
  it("writes the new review status and audits it", async () => {
    const res = await PATCH(
      req("PATCH", { id: "ap-1", reviewStatus: "rejected", reason: "Passing off another artist's work." }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ review_status: "rejected" });
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0].action).toBe("artist.review_status");
  });

  it("tells the artist their account is restricted", async () => {
    await PATCH(
      req("PATCH", { id: "ap-1", reviewStatus: "rejected", reason: "Passing off another artist's work." }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.template).toBe("operational_account_restricted");
    expect(sent.to).toBe("maya@example.com");
  });

  it("refuses to take a profile down without a reason, because the email needs one", async () => {
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "rejected" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("keeps the reason out of the audit context, it is free text about a named person", async () => {
    await PATCH(
      req("PATCH", { id: "ap-1", reviewStatus: "rejected", reason: "Passing off another artist's work." }),
    );
    expect(JSON.stringify(recordMock.mock.calls[0][0].context)).not.toContain("Passing off");
  });
});

describe("G8: putting a profile back", () => {
  beforeEach(() => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return artistsTable({ ...ARTIST, review_status: "rejected" });
    });
  });

  it("stamps approved_at so the marketplace filter sees it", async () => {
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "approved" }));
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ review_status: "approved" });
    expect(updateMock.mock.calls[0][0].approved_at).toBeTruthy();
  });

  it("tells the artist the restriction is lifted", async () => {
    await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "approved" }));
    expect(sendEmailMock.mock.calls[0][0].template).toBe("operational_account_restored");
  });
});

describe("G8: what it must not do", () => {
  it("does not email a never-restricted artist about being restored", async () => {
    // approved -> approved is refused outright, but pending -> approved is a
    // first approval, not a restoration, and "you're back in" would be a lie.
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return artistsTable({ ...ARTIST, review_status: "pending" });
    });
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "approved" }));
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("refuses a status the column's own CHECK would reject", async () => {
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "suspended" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses a no-op rather than sending a second identical email", async () => {
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "approved" }));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("404s on an artist that does not exist", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return artistsTable(null);
    });
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "pending" }));
    expect(res.status).toBe(404);
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "rejected", reason: "Because." }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("still applies the decision when the artist has no reachable address", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: null });
    const res = await PATCH(req("PATCH", { id: "ap-1", reviewStatus: "rejected", reason: "Because." }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// A variant-valid v4 UUID: zod's .uuid() checks the version and variant
// nibbles, so a "shaped like a UUID" string is rejected at the schema.
const ARTIST_ID = "11111111-2222-4333-8444-555555555555";

/** Drive the handler, rather than only building the request. */
function patch(body: unknown, token: string | null = "Bearer x"): Promise<Response> {
  return PATCH(req("PATCH", body, token));
}

/**
 * Wire fromMock for the three shapes the founding branch hits on
 * `artist_profiles`: fetch-by-id (`.eq().maybeSingle()`), a head-count
 * (`.select(col, {head:true}).eq()`, terminal on `.eq()` with no further
 * chaining, matching admin/stats/route.ts), and the update. Plus `admin_users`
 * for the getAdminUser fallback, which is never queried while the caller's
 * email is in ADMIN_EMAILS.
 */
function mockFoundingProfiles(opts: {
  existing?: { id: string; slug: string | null; is_founding_artist: boolean | null } | null;
  fetchError?: { message: string } | null;
  foundingCount?: number;
  countError?: { message: string } | null;
  updateError?: { message: string } | null;
} = {}) {
  const {
    existing = { id: ARTIST_ID, slug: "maya-chen", is_founding_artist: false },
    fetchError = null,
    foundingCount = 0,
    countError = null,
    updateError = null,
  } = opts;

  updateMock.mockReturnValue({ error: updateError });

  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") return adminUsersChain();
    return {
      select: (_cols: string, selectOpts?: { head?: boolean }) => {
        if (selectOpts?.head) {
          return { eq: async () => ({ count: foundingCount, error: countError }) };
        }
        return { eq: () => ({ maybeSingle: async () => ({ data: existing, error: fetchError }) }) };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async () => updateMock(payload),
      }),
    };
  });
}

describe("PATCH /api/admin/artists founding cohort guard (Task 8)", () => {
  it("promotes an artist while the cohort is under the limit", async () => {
    mockFoundingProfiles({ foundingCount: 19 });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, is_founding_artist: true });
    expect(updateMock).toHaveBeenCalledWith({ is_founding_artist: true });
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "artist.founding_status",
      context: { artist_id: ARTIST_ID, slug: "maya-chen", is_founding_artist: true },
    });
  });

  it("409s once FOUNDING_ARTIST_LIMIT (20) are already flagged", async () => {
    mockFoundingProfiles({ foundingCount: 20 });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain("20 artists");
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("409s past the limit too, in case a stale count ever overshoots", async () => {
    mockFoundingProfiles({ foundingCount: 21 });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not refuse re-promoting an artist who is already founding, even at a full cohort", async () => {
    // The cohort is exactly full, but this artist is one of the 20 already
    // counted, so a retry of the same request must not 409 against itself.
    mockFoundingProfiles({
      existing: { id: ARTIST_ID, slug: "maya-chen", is_founding_artist: true },
      foundingCount: 20,
    });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, is_founding_artist: true });
    expect(updateMock).not.toHaveBeenCalled();
    // Still audited (as a no-op), so the row never lands with blank context.
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "artist.founding_status",
      context: { artist_id: ARTIST_ID, slug: "maya-chen", is_founding_artist: true, noop: true },
    });
  });

  it("revokes founding status without consulting the count guard", async () => {
    mockFoundingProfiles({
      existing: { id: ARTIST_ID, slug: "maya-chen", is_founding_artist: true },
      foundingCount: 20,
    });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: false });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ is_founding_artist: false });
  });

  it("404s for an artist id that doesn't exist", async () => {
    mockFoundingProfiles({ existing: null });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("400s on an invalid payload and never reaches the database", async () => {
    const res = await patch({ id: "not-a-uuid", is_founding_artist: true });

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("500s and records nothing when the count check errors", async () => {
    mockFoundingProfiles({ countError: { message: "db down" } });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });

    expect(res.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("500s and records nothing when the update fails", async () => {
    mockFoundingProfiles({ foundingCount: 5, updateError: { message: "permission denied" } });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });

    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    mockFoundingProfiles();
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });

    const res = await patch({ id: ARTIST_ID, is_founding_artist: true });

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await patch({ id: ARTIST_ID, is_founding_artist: true }, null);

    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
