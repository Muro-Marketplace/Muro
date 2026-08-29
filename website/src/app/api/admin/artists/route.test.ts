// Task 8 / Step 2. `is_founding_artist` sits on ARTIST_PROFILE_SERVER_OWNED
// (lib/db/writable-fields.ts), so this PATCH is the only write path for it.
// The flyer's "First 20 artists: 6 months free" claim depends on the count
// guard below actually refusing the 21st artist.
//
// The real `withAdmin` and `getAdminUser` run here against a mocked Supabase,
// same approach as admin/curation/route.test.ts, so these exercise the
// actual predicate rather than a stand-in for it.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

import { PATCH } from "./route";

// A variant-valid v4 UUID: zod's .uuid() checks the version and variant
// nibbles, so a "shaped like a UUID" string is rejected at the schema.
const ARTIST_ID = "11111111-2222-4333-8444-555555555555";

function patch(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/artists", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Wires fromMock for both tables the handler touches: `admin_users` (the
 * getAdminUser fallback, never actually queried while the caller's email is
 * in ADMIN_EMAILS) and `artist_profiles`, which the handler hits three
 * different ways: fetch-by-id (.eq().maybeSingle()), a head-count
 * (.select(col, {head:true}).eq(), terminal on .eq() with no further
 * chaining, matching admin/stats/route.ts's shape), and the update.
 */
function mockArtistProfiles(opts: {
  existing?: { id: string; is_founding_artist: boolean | null } | null;
  fetchError?: { message: string } | null;
  foundingCount?: number;
  countError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const {
    existing = { id: ARTIST_ID, is_founding_artist: false },
    fetchError = null,
    foundingCount = 0,
    countError = null,
    updateError = null,
  } = opts;

  updateMock.mockReturnValue({ error: updateError });

  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    }
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

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  mockArtistProfiles({});
});

describe("PATCH /api/admin/artists founding cohort guard (Task 8)", () => {
  it("promotes an artist while the cohort is under the limit", async () => {
    mockArtistProfiles({ existing: { id: ARTIST_ID, is_founding_artist: false }, foundingCount: 19 });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, is_founding_artist: true });
    expect(updateMock).toHaveBeenCalledWith({ is_founding_artist: true });
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "artist_founding_status_updated",
      context: { artistId: ARTIST_ID, is_founding_artist: true },
    });
  });

  it("409s once FOUNDING_ARTIST_LIMIT (20) are already flagged", async () => {
    mockArtistProfiles({ existing: { id: ARTIST_ID, is_founding_artist: false }, foundingCount: 20 });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain("20 artists");
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("409s past the limit too, in case a stale count ever overshoots", async () => {
    mockArtistProfiles({ existing: { id: ARTIST_ID, is_founding_artist: false }, foundingCount: 21 });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not refuse re-promoting an artist who is already founding, even at a full cohort", async () => {
    // The cohort is exactly full, but this artist is one of the 20 already
    // counted, so a retry of the same request must not 409 against itself.
    mockArtistProfiles({ existing: { id: ARTIST_ID, is_founding_artist: true }, foundingCount: 20 });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, is_founding_artist: true });
    expect(updateMock).not.toHaveBeenCalled();
    // Still audited (as a no-op), so the row never lands with blank context.
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual({
      adminUserId: "u-admin",
      action: "artist_founding_status_updated",
      context: { artistId: ARTIST_ID, is_founding_artist: true, noop: true },
    });
  });

  it("revokes founding status without consulting the count guard", async () => {
    mockArtistProfiles({ existing: { id: ARTIST_ID, is_founding_artist: true }, foundingCount: 20 });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: false }));

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ is_founding_artist: false });
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("404s for an artist id that doesn't exist", async () => {
    mockArtistProfiles({ existing: null });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("400s on an invalid payload and never reaches the database", async () => {
    const res = await PATCH(patch({ id: "not-a-uuid", is_founding_artist: true }));

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("500s and records nothing when the count check errors", async () => {
    mockArtistProfiles({
      existing: { id: ARTIST_ID, is_founding_artist: false },
      countError: { message: "db down" },
    });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));

    expect(res.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("500s and records nothing when the update fails", async () => {
    mockArtistProfiles({
      existing: { id: ARTIST_ID, is_founding_artist: false },
      foundingCount: 5,
      updateError: { message: "permission denied" },
    });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));

    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });

    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }));

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await PATCH(patch({ id: ARTIST_ID, is_founding_artist: true }, null));

    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
