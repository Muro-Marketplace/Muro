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

const { getAuthenticatedUserMock, fromMock, anonFromMock, getUserByIdMock, sendEmailMock, enquiryReceivedMock } =
  vi.hoisted(() => ({
    getAuthenticatedUserMock: vi.fn(),
    fromMock: vi.fn(),
    anonFromMock: vi.fn(),
    getUserByIdMock: vi.fn(async () => ({ data: { user: null as null | { id: string; email: string } } })),
    sendEmailMock: vi.fn(async () => ({ ok: true, skipped: false, messageId: "m" })),
    enquiryReceivedMock: vi.fn(() => null),
  }));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));

// The POST path (public enquiry submit) pulls in the anon client, emails and
// rate limiting; none of it runs in these GET/PATCH tests but the imports
// must resolve.
vi.mock("@/lib/supabase", () => ({ supabase: { from: (...a: unknown[]) => anonFromMock(...a) } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/email/notifications", () => ({ sendMessageUnreadEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/messages/EnquiryReceived", () => ({ EnquiryReceived: enquiryReceivedMock }));

import { GET, PATCH, POST } from "./route";
import { sendMessageUnreadEmail } from "@/lib/email/notifications";

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
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: null } });
  sendEmailMock.mockClear();
  enquiryReceivedMock.mockClear();
  vi.mocked(sendMessageUnreadEmail).mockClear();
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

// Email audit 2026-09-03, item 4. Two gaps on the public enquiry POST:
//
//   1. The artist's inbox email ignored artist_profiles.message_notifications_enabled,
//      which api/messages honours for the very same template, so an artist who
//      had switched per-message email off still got one for every enquiry.
//   2. The enquirer got nothing back, so a delivered enquiry and a form that
//      silently failed looked identical from their side.
describe("POST /api/enquiry honours the artist's message switch and acknowledges the enquirer (item 4)", () => {
  const BODY = {
    senderName: "Priya Patel",
    senderEmail: "priya@example.com",
    artistSlug: "maya-chen",
    workTitle: "Morning Field",
    enquiryType: "general",
    message: "Is this still available?",
  };

  function setupPost({ notificationsEnabled }: { notificationsEnabled: boolean | null | undefined }) {
    anonFromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
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
          insert: () => ({
            select: () => ({ maybeSingle: async () => ({ data: { id: "m-77" }, error: null }) }),
          }),
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { name: "Maya Chen", user_id: "u-maya", message_notifications_enabled: notificationsEnabled },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    getUserByIdMock.mockResolvedValue({ data: { user: { id: "u-maya", email: "maya@example.com" } } });
  }

  function submit() {
    return POST(
      new Request("http://localhost/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(BODY),
      }),
    );
  }

  it("skips the artist's inbox email when they have switched message notifications off", async () => {
    setupPost({ notificationsEnabled: false });

    const res = await submit();

    expect(res.status).toBe(200);
    // Fail-before: the switch was never read here, so this sent.
    expect(sendMessageUnreadEmail).not.toHaveBeenCalled();
  });

  it("still emails the artist when the switch is on", async () => {
    setupPost({ notificationsEnabled: true });
    await submit();
    expect(sendMessageUnreadEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessageUnreadEmail).mock.calls[0][0]).toMatchObject({
      recipientEmail: "maya@example.com",
      recipientUserId: "u-maya",
      messageId: "m-77",
    });
  });

  it("treats an unset switch as on, exactly as api/messages does", async () => {
    setupPost({ notificationsEnabled: null });
    await submit();
    expect(sendMessageUnreadEmail).toHaveBeenCalledTimes(1);
  });

  it("acknowledges the enquirer: no user id, the always-send category, keyed on the message row", async () => {
    setupPost({ notificationsEnabled: true });

    await submit();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = (sendEmailMock.mock.calls as unknown as unknown[][])[0][0] as unknown as {
      idempotencyKey: string; template: string; category: string; to: string; userId?: string; subject: string;
    };
    expect(sent.template).toBe("enquiry_received");
    expect(sent.category).toBe("orders_and_payouts");
    expect(sent.to).toBe("priya@example.com");
    expect(sent.userId).toBeUndefined();
    expect(sent.idempotencyKey).toBe("enquiry_ack:m-77");
    expect(sent.subject).toBe("We've passed your message to Maya Chen");
    expect(enquiryReceivedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Priya",
        artistName: "Maya Chen",
        workTitle: "Morning Field",
        enquiryTypeLabel: "General question",
        messageExcerpt: "Is this still available?",
        artistProfileUrl: expect.stringContaining("/browse/maya-chen"),
      }),
    );
  });

  it("acknowledges the enquirer even when the artist has switched their own email off", async () => {
    setupPost({ notificationsEnabled: false });
    await submit();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(((sendEmailMock.mock.calls as unknown as unknown[][])[0][0] as unknown as { template: string }).template).toBe("enquiry_received");
  });
});
