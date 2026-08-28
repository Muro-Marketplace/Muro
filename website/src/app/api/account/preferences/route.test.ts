// /api/account/preferences — GET / PATCH for notification preferences.
//
// Coverage:
//   - 401 when no auth
//   - 400 when role is unsupported (admin, missing)
//   - GET happy path with all-true defaults
//   - GET when row missing → returns defaults (all true)
//   - GET when columns are null → returns true (default)
//   - PATCH writes only known boolean fields, ignores unknown keys
//   - PATCH ignores non-boolean values (string "true", number 1)
//   - PATCH returns 400 when no valid fields supplied
//   - PATCH targets the correct profile table per role

import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUserMock = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// We don't mock auth-roles — the real parseRole is what we want exercised.
import { GET, PATCH } from "./route";

beforeEach(() => {
  fromMock.mockReset();
  getAuthenticatedUserMock.mockReset();
  // Default: an authenticated artist
  getAuthenticatedUserMock.mockResolvedValue({
    user: { id: "u1", user_metadata: { user_type: "artist" } },
    error: null,
  });
});

function req(method: "GET" | "PATCH", body?: unknown): Request {
  return new Request("http://localhost/api/account/preferences", {
    method,
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("/api/account/preferences", () => {
  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: null,
        error: new Response(null, { status: 401 }),
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(401);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("returns 400 when user role is unsupported (admin)", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: { user_type: "admin" } },
        error: null,
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("returns 400 when role is missing entirely", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: {} },
        error: null,
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("returns preferences from the row when present", async () => {
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                email_digest_enabled: true,
                message_notifications_enabled: false,
                order_notifications_enabled: true,
              },
              error: null,
            }),
          }),
        }),
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences.email_digest_enabled).toBe(true);
      expect(body.preferences.message_notifications_enabled).toBe(false);
      expect(body.preferences.order_notifications_enabled).toBe(true);
    });

    it("returns all-true defaults when the row is missing", async () => {
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences).toEqual({
        email_digest_enabled: true,
        message_notifications_enabled: true,
        order_notifications_enabled: true,
      });
    });

    it("treats null columns as true (opt-in default)", async () => {
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                email_digest_enabled: null,
                message_notifications_enabled: null,
                order_notifications_enabled: null,
              },
              error: null,
            }),
          }),
        }),
      });
      const res = await GET(req("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences.email_digest_enabled).toBe(true);
      expect(body.preferences.message_notifications_enabled).toBe(true);
      expect(body.preferences.order_notifications_enabled).toBe(true);
    });

    it("queries the artist_profiles table for an artist user", async () => {
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });
      await GET(req("GET"));
      expect(fromMock).toHaveBeenCalledWith("artist_profiles");
    });

    it("queries the venue_profiles table for a venue user", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: { user_type: "venue" } },
        error: null,
      });
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });
      await GET(req("GET"));
      expect(fromMock).toHaveBeenCalledWith("venue_profiles");
    });

    it("queries the customer_profiles table for a customer user", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: { user_type: "customer" } },
        error: null,
      });
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });
      await GET(req("GET"));
      expect(fromMock).toHaveBeenCalledWith("customer_profiles");
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: null,
        error: new Response(null, { status: 401 }),
      });
      const res = await PATCH(req("PATCH", { email_digest_enabled: false }));
      expect(res.status).toBe(401);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("returns 400 when role is unsupported (admin)", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: { user_type: "admin" } },
        error: null,
      });
      const res = await PATCH(req("PATCH", { email_digest_enabled: false }));
      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("writes only known boolean fields (ignores bogus key)", async () => {
      const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
      fromMock.mockReturnValue({ update });
      const res = await PATCH(
        req("PATCH", { email_digest_enabled: false, bogus: "ignored" }),
      );
      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ email_digest_enabled: false });
    });

    it("ignores non-boolean values (string, number)", async () => {
      const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
      fromMock.mockReturnValue({ update });
      const res = await PATCH(
        req("PATCH", {
          email_digest_enabled: "true", // string, ignored
          message_notifications_enabled: 1, // number, ignored
          order_notifications_enabled: false, // valid
        }),
      );
      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalledWith({ order_notifications_enabled: false });
    });

    it("returns 400 when no valid boolean fields are supplied", async () => {
      const update = vi.fn();
      fromMock.mockReturnValue({ update });
      const res = await PATCH(req("PATCH", { bogus: "ignored", another: 42 }));
      expect(res.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
    });

    it("returns 400 when body is malformed JSON", async () => {
      const update = vi.fn();
      fromMock.mockReturnValue({ update });
      const r = new Request("http://localhost/api/account/preferences", {
        method: "PATCH",
        headers: { authorization: "Bearer x", "content-type": "application/json" },
        body: "not json",
      });
      const res = await PATCH(r);
      expect(res.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
    });

    it("targets the correct table for a venue user", async () => {
      getAuthenticatedUserMock.mockResolvedValue({
        user: { id: "u1", user_metadata: { user_type: "venue" } },
        error: null,
      });
      const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
      fromMock.mockReturnValue({ update });
      await PATCH(req("PATCH", { email_digest_enabled: true }));
      expect(fromMock).toHaveBeenCalledWith("venue_profiles");
    });

    it("scopes the update to the authenticated user_id", async () => {
      const eqFn = vi.fn(() => Promise.resolve({ error: null }));
      const update = vi.fn(() => ({ eq: eqFn }));
      fromMock.mockReturnValue({ update });
      await PATCH(req("PATCH", { email_digest_enabled: false }));
      expect(eqFn).toHaveBeenCalledWith("user_id", "u1");
    });

    it("returns 500 when the update reports a db error", async () => {
      const update = vi.fn(() => ({
        eq: () => Promise.resolve({ error: { message: "boom" } }),
      }));
      fromMock.mockReturnValue({ update });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await PATCH(req("PATCH", { email_digest_enabled: false }));
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });
  });
});

// E13/E14 (WS8 item 3). venue_profiles has no order_notifications_enabled
// column, and PostgREST rejects a select naming a missing column, so the
// all-fields select 500'd EVERY venue GET (the checkboxes silently showed
// defaults) and the venue "Order updates" PATCH failed every time. Venues now
// read and write only the two columns their table has.
describe("/api/account/preferences venue field list (E13/E14)", () => {
  const VENUE_COLUMNS = new Set(["email_digest_enabled", "message_notifications_enabled"]);

  beforeEach(() => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: { id: "u1", user_metadata: { user_type: "venue" } },
      error: null,
    });
  });

  it("GET selects only columns venue_profiles actually has", async () => {
    const selects: string[] = [];
    fromMock.mockReturnValue({
      select: (cols: string) => {
        selects.push(cols);
        // Model PostgREST: naming a missing column rejects the whole query.
        const missing = cols.split(",").map((c) => c.trim()).find((c) => !VENUE_COLUMNS.has(c));
        return {
          eq: () => ({
            maybeSingle: async () =>
              missing
                ? { data: null, error: { message: `column venue_profiles.${missing} does not exist` } }
                : { data: { email_digest_enabled: false, message_notifications_enabled: true }, error: null },
          }),
        };
      },
    });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.email_digest_enabled).toBe(false);
    expect(body.preferences.message_notifications_enabled).toBe(true);
    // The missing column is omitted, not invented.
    expect(body.preferences).not.toHaveProperty("order_notifications_enabled");
    expect(selects.join(",")).not.toContain("order_notifications_enabled");
  });

  it("PATCH drops order_notifications_enabled for a venue and writes the rest", async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromMock.mockReturnValue({ update });
    const res = await PATCH(
      req("PATCH", { order_notifications_enabled: false, email_digest_enabled: false }),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ email_digest_enabled: false });
  });

  it("PATCH with only the missing field returns 400 rather than writing a phantom column", async () => {
    const update = vi.fn();
    fromMock.mockReturnValue({ update });
    const res = await PATCH(req("PATCH", { order_notifications_enabled: false }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("artists still read and write all three fields", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: { id: "u1", user_metadata: { user_type: "artist" } },
      error: null,
    });
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromMock.mockReturnValue({ update });
    const res = await PATCH(req("PATCH", { order_notifications_enabled: false }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ order_notifications_enabled: false });
  });
});

// C11 (WS8 item 2). Nothing in the signup flow ever inserts a
// customer_profiles row, so the customer PATCH used to be an
// UPDATE ... WHERE user_id = X that matched zero rows and still answered ok:
// the toggle looked saved and silently reverted on the next load. Customer
// PATCHes now get-or-create the row via an upsert keyed on the verified
// auth user id.
describe("/api/account/preferences customer get-or-create (C11)", () => {
  beforeEach(() => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: { id: "u1", email: "cust@example.com", user_metadata: { user_type: "customer" } },
      error: null,
    });
  });

  it("PATCH upserts the customer_profiles row keyed on the token's user_id", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn();
    fromMock.mockReturnValue({ upsert, update });

    const res = await PATCH(req("PATCH", { email_digest_enabled: false }));

    expect(res.status).toBe(200);
    // Fail-before: this was update().eq("user_id", ...), matching zero rows
    // for every customer and reporting ok anyway.
    expect(update).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", email: "cust@example.com", email_digest_enabled: false },
      { onConflict: "user_id" },
    );
    expect(fromMock).toHaveBeenCalledWith("customer_profiles");
  });

  it("PATCH surfaces an upsert failure as a 500 so the settings card can revert", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: { message: "boom" } }));
    fromMock.mockReturnValue({ upsert });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await PATCH(req("PATCH", { email_digest_enabled: false }));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("artists and venues keep the plain update path (no upsert)", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: { id: "u1", user_metadata: { user_type: "artist" } },
      error: null,
    });
    const upsert = vi.fn();
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromMock.mockReturnValue({ upsert, update });

    const res = await PATCH(req("PATCH", { email_digest_enabled: false }));

    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ email_digest_enabled: false });
  });
});
