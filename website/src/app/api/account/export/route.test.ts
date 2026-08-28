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

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserMock, queries } = vi.hoisted(() => ({
  getAuthenticatedUserMock: vi.fn(),
  queries: [] as { table: string; column: string; value: string }[],
}));

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
  getAuthenticatedUserMock.mockReset();
  getAuthenticatedUserMock.mockResolvedValue({
    user: { id: "user-1", email: "finlay@example.com" },
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
