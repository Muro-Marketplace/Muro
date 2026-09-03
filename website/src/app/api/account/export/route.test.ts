// /api/account/export — the GDPR right-of-access dump (C30/C33, QA 2026-08-28).
//
// Coverage:
//   - POST no longer 405s: the export page used to POST while only GET was
//     exported, so the subject-access feature was dead as shipped.
//   - The dump queries the REAL tables: artist_applications and
//     waitlist_signups (the phantom "applications" / "waitlist" names made
//     those sections silently empty forever, because fetchAll swallows
//     errors by design).
//   - artist_collections (and artist_works) are keyed by artist_profiles.id,
//     not the auth user id.
//   - customer_profiles, customer_addresses and email_preferences are
//     included, keyed to the caller's user_id.
//   - Everything is keyed to the token's user, never to anything client-sent.
//   - Email audit 2026-09-04: producing an export emails the account's own
//     address, so a subject-access request leaves a record and the real owner
//     hears about it if somebody else exported their data.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserMock, queries, sendEmailMock } = vi.hoisted(() => ({
  getAuthenticatedUserMock: vi.fn(),
  queries: [] as { table: string; column: string; value: string }[],
  sendEmailMock: vi.fn(async (_input: {
    idempotencyKey: string;
    template: string;
    category: string;
    to: string;
    subject: string;
    userId?: string;
    react: unknown;
    metadata?: Record<string, unknown>;
  }) => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

// Mocked so the receipt does not run the real pipeline against the fake below:
// sendEmail does its own email_events lookups, which would land in `queries`
// and make "every query is scoped to the caller" fail on an idempotency key.
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => {
          queries.push({ table, column, value });
          const rows =
            table === "artist_profiles" && column === "user_id"
              ? [{ id: "profile-1" }]
              : [];
          return Object.assign(Promise.resolve({ data: rows, error: null }), {
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          });
        },
      }),
    }),
  }),
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/account/export", {
    method,
    headers: { authorization: "Bearer x" },
  });
}

beforeEach(() => {
  queries.length = 0;
  sendEmailMock.mockClear();
  getAuthenticatedUserMock.mockReset();
  getAuthenticatedUserMock.mockResolvedValue({
    user: { id: "user-1", email: "finlay@example.com", user_metadata: { display_name: "Finlay Coles" } },
    error: null,
  });
});

describe("GET /api/account/export", () => {
  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(queries).toHaveLength(0);
  });

  it("serves the dump as a JSON attachment", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const body = await res.json();
    expect(body.user).toEqual({ id: "user-1", email: "finlay@example.com" });
  });

  it("queries the real application/waitlist tables, never the phantom names", async () => {
    await GET(req());
    const tables = queries.map((q) => q.table);
    // Fail-before: "applications" and "waitlist" do not exist, so both
    // sections were silently empty on every export.
    expect(tables).not.toContain("applications");
    expect(tables).not.toContain("waitlist");
    expect(queries).toContainEqual({ table: "artist_applications", column: "email", value: "finlay@example.com" });
    expect(queries).toContainEqual({ table: "waitlist_signups", column: "email", value: "finlay@example.com" });
  });

  it("keys collections and works by artist_profiles.id, not the auth user id", async () => {
    await GET(req());
    // Fail-before: artist_collections was keyed by user id where the column
    // holds artist_profiles.id, so the section was always empty.
    expect(queries).toContainEqual({ table: "artist_collections", column: "artist_id", value: "profile-1" });
    expect(queries).toContainEqual({ table: "artist_works", column: "artist_id", value: "profile-1" });
    expect(queries.filter((q) => q.table === "artist_collections" && q.value === "user-1")).toHaveLength(0);
  });

  it("includes customer_profiles, customer_addresses and email_preferences keyed to the caller", async () => {
    const res = await GET(req());
    expect(queries).toContainEqual({ table: "customer_profiles", column: "user_id", value: "user-1" });
    expect(queries).toContainEqual({ table: "customer_addresses", column: "user_id", value: "user-1" });
    expect(queries).toContainEqual({ table: "email_preferences", column: "user_id", value: "user-1" });
    const body = await res.json();
    expect(body.data).toHaveProperty("customerAddresses");
    expect(body.data).toHaveProperty("emailPreferences");
    expect(body.data).toHaveProperty("customerProfile");
    expect(body.data).toHaveProperty("artistApplications");
    expect(body.data).toHaveProperty("waitlistSignups");
    expect(body.data).not.toHaveProperty("applications");
    expect(body.data).not.toHaveProperty("waitlist");
  });

  it("scopes every query to the token's user id or email", async () => {
    await GET(req());
    for (const q of queries) {
      expect(["user-1", "finlay@example.com", "profile-1"]).toContain(q.value);
    }
  });
});

describe("GET /api/account/export emails a receipt", () => {
  it("sends account_data_export_ready to the account's own address", async () => {
    // Fail-before: the template existed and nothing sent it, so an export left
    // no trace anyone could see.
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.template).toBe("account_data_export_ready");
    expect(sent.to).toBe("finlay@example.com");
    expect(sent.category).toBe("security");
    expect(sent.userId).toBe("user-1");
  });

  it("keys the send on the user id plus the export timestamp, so a later export sends again", async () => {
    await GET(req());
    const body = await (await GET(req())).json();
    const keys = sendEmailMock.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toMatch(/^account_data_export_ready:user-1:\d{4}-\d{2}-\d{2}T/);
    // The key carries the same instant the payload reports, so the receipt and
    // the dump can be tied together after the fact.
    expect(keys[1]).toBe(`account_data_export_ready:user-1:${body.exportedAt}`);
  });

  it("still serves the dump when the receipt fails", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).user.id).toBe("user-1");
    errSpy.mockRestore();
  });

  it("sends nothing when the account has no address", async () => {
    getAuthenticatedUserMock.mockResolvedValue({ user: { id: "user-1", email: "" }, error: null });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/account/export (C30 stale-bundle alias)", () => {
  it("serves the same dump instead of 405ing", async () => {
    // Fail-before: the export page POSTed here, only GET existed, and every
    // export attempt died as a 405 with the page promising a manual email.
    const res = await POST(req("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("user-1");
  });
});
