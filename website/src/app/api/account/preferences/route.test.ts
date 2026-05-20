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
