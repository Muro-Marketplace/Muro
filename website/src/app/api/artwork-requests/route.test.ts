// POST /api/artwork-requests, the invitation emails (email audit 2026-09-03,
// item 2a). A venue posting a brief emailed nobody. The artists named on the
// invite list now get "you've been invited to respond to a brief", and ONLY
// them: a semi-public brief with no invite list is discoverable from the
// artist portal and must not become a broadcast.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, invitationTemplateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  // The signature is declared rather than inferred from a named-but-unused
  // parameter, so the per-test mockImplementation((id) => ...) still types.
  getUserByIdMock: vi.fn<
    (id: string) => Promise<{
      data: { user: null | { id: string; email: string; user_metadata: Record<string, unknown> } };
    }>
  >(async () => ({ data: { user: null } })),
  sendEmailMock: vi.fn(async () => ({ ok: true, skipped: false, messageId: "m" })),
  invitationTemplateMock: vi.fn(() => null),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: { id: "u-venue", email: "venue@example.com" }, error: null })),
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/artwork-requests/ArtistBriefInvitation", () => ({
  ArtistBriefInvitation: invitationTemplateMock,
}));

import { POST } from "./route";

type ArtistRow = { user_id: string | null; slug: string; name: string | null };

/** Rows handed to artwork_requests.insert, and the slugs the artist lookup was asked for. */
let requestInserts: Record<string, unknown>[] = [];
let lookedUpSlugs: string[] | null = null;

function setupDb(artists: ArtistRow[]) {
  requestInserts = [];
  lookedUpSlugs = null;
  fromMock.mockImplementation((table: string) => {
    if (table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { user_id: "u-venue", slug: "copper-kettle", name: "The Copper Kettle" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "artwork_requests") {
      return {
        insert: async (row: Record<string, unknown>) => {
          requestInserts.push(row);
          return { error: null };
        },
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          in: async (_col: string, slugs: string[]) => {
            lookedUpSlugs = slugs;
            return { data: artists.filter((a) => slugs.includes(a.slug)), error: null };
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/artwork-requests", {
      method: "POST",
      headers: { authorization: "Bearer venue", "content-type": "application/json" },
      body: JSON.stringify({
        title: "Coffee shop wall",
        description: "A 3m wall behind the counter, warm abstracts to go with the brick.",
        intent: ["purchase", "display"],
        budgetMinPence: 30000,
        budgetMaxPence: 90000,
        timescale: "weeks",
        ...body,
      }),
    }),
  );
}

type SentEmail = { idempotencyKey: string; template: string; category: string; to: string; userId?: string };
const sent = () => (sendEmailMock.mock.calls as unknown as unknown[][]).map((c) => c[0] as unknown as SentEmail);

beforeEach(() => {
  fromMock.mockReset();
  sendEmailMock.mockClear();
  invitationTemplateMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockImplementation(async (id: string) => ({
    data: { user: { id, email: `${id}@example.com`, user_metadata: {} } },
  }));
});

describe("POST /api/artwork-requests invites the named artists by email (item 2a)", () => {
  it("emails each invited artist once, keyed per brief and artist, on the placements category", async () => {
    setupDb([
      { user_id: "u-alice", slug: "alice", name: "Alice Artist" },
      { user_id: "u-bob", slug: "bob", name: "Bob Brush" },
    ]);

    const res = await post({ visibility: "private", invitedArtistSlugs: ["alice", "bob"] });
    expect(res.status).toBe(200);
    const { id } = await res.json();

    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(2));
    expect(lookedUpSlugs).toEqual(["alice", "bob"]);
    const emails = sent();
    expect(emails.map((e) => e.to).sort()).toEqual(["u-alice@example.com", "u-bob@example.com"]);
    expect(emails.map((e) => e.idempotencyKey).sort()).toEqual([
      `artwork_request_invite:${id}:u-alice`,
      `artwork_request_invite:${id}:u-bob`,
    ]);
    for (const e of emails) {
      expect(e.template).toBe("artist_brief_invitation");
      expect(e.category).toBe("placements");
      expect(e.userId).toBe(e.to.replace("@example.com", ""));
    }
    expect(invitationTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        venueName: "The Copper Kettle",
        requestTitle: "Coffee shop wall",
        intentLabel: "Purchase, QR-enabled display",
        budgetLabel: "£300 to £900",
        timescaleLabel: "Within a few weeks",
        requestUrl: expect.stringContaining(`/artist-portal/artwork-requests/${id}`),
      }),
    );
  });

  it("emails nobody for a brief with no invite list, however visible it is", async () => {
    setupDb([{ user_id: "u-alice", slug: "alice", name: "Alice Artist" }]);

    const res = await post({ visibility: "semi_public" });

    expect(res.status).toBe(200);
    expect(requestInserts).toHaveLength(1);
    // The route never reaches afterResponse without invitees, so this is a
    // deterministic check rather than a race against a deferred send.
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(lookedUpSlugs).toBeNull();
  });

  it("skips an invited slug with no linked account, and still emails the rest", async () => {
    setupDb([
      { user_id: null, slug: "seed-only", name: "Seed Artist" },
      { user_id: "u-bob", slug: "bob", name: "Bob Brush" },
    ]);

    const res = await post({ visibility: "private", invitedArtistSlugs: ["seed-only", "bob", "nobody"] });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(sent()[0].to).toBe("u-bob@example.com");
  });

  it("skips an invited artist with no reachable address, and still emails the rest", async () => {
    setupDb([
      { user_id: "u-alice", slug: "alice", name: "Alice Artist" },
      { user_id: "u-bob", slug: "bob", name: "Bob Brush" },
    ]);
    getUserByIdMock.mockImplementation(async (id: string) => ({
      data: { user: id === "u-alice" ? null : { id, email: `${id}@example.com`, user_metadata: {} } },
    }));

    const res = await post({ visibility: "private", invitedArtistSlugs: ["alice", "bob"] });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(sent()[0].to).toBe("u-bob@example.com");
  });

  it("de-duplicates the invite list, so one artist named twice gets one email", async () => {
    setupDb([{ user_id: "u-alice", slug: "alice", name: "Alice Artist" }]);

    await post({ visibility: "private", invitedArtistSlugs: ["alice", "alice"] });

    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(lookedUpSlugs).toEqual(["alice"]);
  });
});
