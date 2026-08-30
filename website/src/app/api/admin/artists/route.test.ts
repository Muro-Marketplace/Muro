// G8. The artists admin surface was a read-only table: the list did not even
// select review_status, so an admin could not see whether a profile was live on
// the marketplace, and there was no write path at all. Taking a profile down
// meant editing the row in Supabase by hand.
//
// Two operational templates had been written, styled and registered for exactly
// this and were sent by nothing: OperationalAccountRestricted and
// OperationalAccountRestored.

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
