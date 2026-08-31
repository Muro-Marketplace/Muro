// /api/enquiry GET + PATCH — the artist-portal enquiries view (E1/E5/E27,
// QA 2026-08-28).
//
// Enquiries are messages from the public artist page's enquiry form, keyed
// on artist_slug. The venue portal shipped a page that GET this route while
// no GET handler existed (permanent 405, permanently empty list) — and
// venues were never the audience. The GET now serves the authenticated
// ARTIST their own enquiries; PATCH lets the artist mark one handled, and
// both are scoped to the caller's own slug.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserMock, fromMock, anonFromMock } = vi.hoisted(() => ({
  getAuthenticatedUserMock: vi.fn(),
  fromMock: vi.fn(),
  anonFromMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// The POST path (public enquiry submit) pulls in the anon client, emails and
// rate limiting; none of it runs in these GET/PATCH tests but the imports
// must resolve.
vi.mock("@/lib/supabase", () => ({ supabase: { from: (...a: unknown[]) => anonFromMock(...a) } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/email/notifications", () => ({ sendMessageUnreadEmail: vi.fn() }));

import { GET, PATCH, POST } from "./route";

const ENQUIRY_ROW = {
  id: 7,
  sender_name: "Priya",
  sender_email: "priya@example.com",
  work_title: "Morning Field",
  enquiry_type: "purchasing",
  message: "Is this still available?",
  status: "pending",
  created_at: "2026-08-01T10:00:00Z",
};

/** Wire fromMock so artist_profiles resolves `slug` and enquiries records calls. */
function mockDb({
  slug = "maya-chen",
  enquiries = [ENQUIRY_ROW],
  updated = [{ id: 7, status: "handled" }],
}: {
  slug?: string | null;
  enquiries?: unknown[];
  updated?: unknown[];
} = {}) {
  const calls = {
    listFilters: [] as { column: string; value: unknown }[],
    updatePayload: null as unknown,
    updateFilters: [] as { column: string; value: unknown }[],
  };
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: slug ? { slug } : null, error: null }),
          }),
        }),
      };
    }
    if (table === "enquiries") {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            calls.listFilters.push({ column, value });
            return {
              order: async () => ({ data: enquiries, error: null }),
            };
          },
        }),
        update: (payload: unknown) => {
          calls.updatePayload = payload;
          const chain = {
            eq: (column: string, value: unknown) => {
              calls.updateFilters.push({ column, value });
              return chain;
            },
            select: async () => ({ data: updated, error: null }),
          };
          return chain;
        },
      };
    }
    return {};
  });
  return calls;
}

function req(method: "GET" | "PATCH", body?: unknown): Request {
  return new Request("http://localhost/api/enquiry", {
    method,
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  getAuthenticatedUserMock.mockReset();
  fromMock.mockReset();
  getAuthenticatedUserMock.mockResolvedValue({
    user: { id: "artist-user-1" },
    error: null,
  });
});

describe("GET /api/enquiry", () => {
  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for an account with no artist profile (enquiries belong to artists)", async () => {
    mockDb({ slug: null });
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });

  it("returns the caller's enquiries scoped to their own slug", async () => {
    const calls = mockDb();
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enquiries).toHaveLength(1);
    expect(body.enquiries[0].sender_name).toBe("Priya");
    // The scope is the profile slug resolved from the TOKEN's user id — the
    // caller never names a slug.
    expect(calls.listFilters).toContainEqual({ column: "artist_slug", value: "maya-chen" });
  });
});

describe("PATCH /api/enquiry", () => {
  it("marks an enquiry handled, scoped to the caller's slug", async () => {
    const calls = mockDb();
    const res = await PATCH(req("PATCH", { id: 7, status: "handled" }));
    expect(res.status).toBe(200);
    expect(calls.updatePayload).toEqual({ status: "handled" });
    expect(calls.updateFilters).toContainEqual({ column: "id", value: 7 });
    expect(calls.updateFilters).toContainEqual({ column: "artist_slug", value: "maya-chen" });
  });

  it("answers 404 when the id belongs to another artist (zero rows matched)", async () => {
    mockDb({ updated: [] });
    const res = await PATCH(req("PATCH", { id: 999, status: "handled" }));
    expect(res.status).toBe(404);
  });

  it("rejects an unknown status with 400", async () => {
    mockDb();
    const res = await PATCH(req("PATCH", { id: 7, status: "archived" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing id with 400", async () => {
    mockDb();
    const res = await PATCH(req("PATCH", { status: "handled" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-artist caller", async () => {
    mockDb({ slug: null });
    const res = await PATCH(req("PATCH", { id: 7, status: "handled" }));
    expect(res.status).toBe(403);
  });
});

// C L1124. The enquiries row stored the name the form collected; the message
// written into the artist's inbox a few lines later stored the email's local
// part instead. An enquiry from Finlay Coles arrived in the inbox as
// "fcoles2598", with the real name buried in the body text. Two writes, the
// same person, different answers.
describe("POST /api/enquiry names the sender consistently (C L1124)", () => {
  /** Capture both inserts the POST path makes. */
  async function submit(body: Record<string, unknown>) {
    const enquiryInserts: Record<string, unknown>[] = [];
    const messageInserts: Record<string, unknown>[] = [];

    anonFromMock.mockImplementation((table: string) => {
      if (table === "enquiries") {
        return { insert: async (row: Record<string, unknown>) => { enquiryInserts.push(row); return { error: null }; } };
      }
      if (table === "artist_profiles") {
        // #78 resolves the artist's real name for the alert subject, so the
        // slug never reaches a human. Answer it or the POST throws before it
        // reaches the messages insert.
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { name: "Maya Chen" }, error: null }) }),
          }),
        };
      }
      return { insert: async () => ({ error: null }) };
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "messages") {
        return {
          insert: (row: Record<string, unknown>) => {
            messageInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "m-1" }, error: null }) }) };
          },
        };
      }
      // artist_profiles lookups and anything else the path touches.
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    });

    await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        senderName: "Finlay Coles",
        senderEmail: "fcoles2598@gmail.com",
        artistSlug: "maya-chen",
        enquiryType: "general",
        message: "Is this still available?",
        ...body,
      }),
    }));

    return { enquiryRow: enquiryInserts[0], messageRow: messageInserts[0] };
  }

  it("uses the collected name for the artist's inbox, not the email local part", async () => {
    const { messageRow } = await submit({});

    expect(messageRow?.sender_name).toBe("Finlay Coles");
    expect(messageRow?.sender_name).not.toBe("fcoles2598");
  });

  it("agrees with the enquiries row about who sent it", async () => {
    const { enquiryRow, messageRow } = await submit({});

    expect(enquiryRow?.sender_name).toBe("Finlay Coles");
    expect(messageRow?.sender_name).toBe(enquiryRow?.sender_name);
  });

  it("keeps the sender's address in the body, where the artist replies from", async () => {
    const { messageRow } = await submit({});

    expect(String(messageRow?.content)).toContain("fcoles2598@gmail.com");
  });
});
