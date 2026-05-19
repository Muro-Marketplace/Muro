import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  applicationInsertMock,
  profilesSelectMock,
  profilesSelectBySlugMock,
  profilesInsertMock,
  getAuthenticatedUserMock,
  sendEmailMock,
  notifyAdminMock,
} = vi.hoisted(() => ({
  applicationInsertMock: vi.fn(),
  profilesSelectMock: vi.fn(),
  profilesSelectBySlugMock: vi.fn(),
  profilesInsertMock: vi.fn(),
  getAuthenticatedUserMock: vi.fn(),
  sendEmailMock: vi.fn(),
  notifyAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "artist_applications") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            applicationInsertMock(payload);
            return { error: null };
          },
        };
      }
      return {};
    },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "artist_profiles") {
        return {
          // First call: lookup by user_id. Second/onwards: lookup by slug for
          // collision detection. The mocks below capture both via separate
          // hoisted fns.
          select: () => ({
            eq: (column: string) => {
              if (column === "user_id") {
                return {
                  maybeSingle: async () => {
                    return profilesSelectMock();
                  },
                };
              }
              return {
                maybeSingle: async () => profilesSelectBySlugMock(),
              };
            },
          }),
          insert: async (payload: Record<string, unknown>) => {
            profilesInsertMock(payload);
            return { error: null };
          },
        };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => getAuthenticatedUserMock()),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/email", () => ({
  notifyAdminNewApplication: (...args: unknown[]) => notifyAdminMock(...args),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => {
    sendEmailMock(...args);
    return Promise.resolve({});
  },
}));

vi.mock("@/emails/templates/artist-additions/ArtistApplicationSubmitted", () => ({
  ArtistApplicationSubmitted: () => null,
}));

import { POST } from "./route";

const VALID_BODY = {
  name: "Finlay Coles",
  email: "finlay@example.com",
  location: "London",
  artistStatement: "I paint in oil on canvas.",
  selectedPlan: "core",
};

function req(body: unknown = VALID_BODY, withAuth = true): Request {
  return new Request("http://localhost/api/apply", {
    method: "POST",
    headers: withAuth
      ? { authorization: "Bearer x", "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  applicationInsertMock.mockReset();
  profilesSelectMock.mockReset();
  profilesSelectBySlugMock.mockReset();
  profilesInsertMock.mockReset();
  getAuthenticatedUserMock.mockReset();
  sendEmailMock.mockReset();
  notifyAdminMock.mockReset();

  // Default: authed user with no existing profile and no slug collisions.
  getAuthenticatedUserMock.mockReturnValue({
    user: { id: "user-1", email: "finlay@example.com" },
    error: null,
  });
  profilesSelectMock.mockReturnValue({ data: null, error: null });
  profilesSelectBySlugMock.mockReturnValue({ data: null, error: null });
});

describe("POST /api/apply creates the artist_profiles bridge row", () => {
  it("creates the artist_applications row AND the artist_profiles row for an authed applicant", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);

    // Application row, source of truth for admin review queue.
    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
    const appPayload = applicationInsertMock.mock.calls[0][0];
    expect(appPayload.status).toBe("pending");
    expect(appPayload.email).toBe("finlay@example.com");

    // Profile bridge row, lets the applicant log in and upload before
    // admin approval. Without this row, /api/artist-works POST returns
    // 404 "No artist profile found".
    expect(profilesInsertMock).toHaveBeenCalledTimes(1);
    const profilePayload = profilesInsertMock.mock.calls[0][0];
    expect(profilePayload.user_id).toBe("user-1");
    expect(profilePayload.slug).toBe("finlay-coles");
    expect(profilePayload.name).toBe("Finlay Coles");
    expect(profilePayload.review_status).toBe("pending");
  });

  it("resolves slug collisions with a numeric suffix", async () => {
    // First slug lookup returns a clash, second one is free. The route
    // should land on "finlay-coles-2".
    profilesSelectBySlugMock
      .mockReturnValueOnce({ data: { id: "x" }, error: null })
      .mockReturnValueOnce({ data: null, error: null });

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(profilesInsertMock).toHaveBeenCalledTimes(1);
    expect(profilesInsertMock.mock.calls[0][0].slug).toBe("finlay-coles-2");
  });

  it("skips the profile bridge when the user already has an artist_profiles row", async () => {
    profilesSelectMock.mockReturnValue({
      data: { id: "existing-profile", review_status: "approved" },
      error: null,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);

    // Application still recorded so admin can still review.
    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
    // But no profile insert: we don't regress an already-approved artist
    // back to pending just because they re-applied.
    expect(profilesInsertMock).not.toHaveBeenCalled();
  });

  it("still records the application when the request is unauthenticated", async () => {
    getAuthenticatedUserMock.mockReturnValue({
      user: null,
      error: { status: 401 },
    });

    const res = await POST(req(VALID_BODY, false));
    expect(res.status).toBe(200);

    // Legacy path: application row written, profile bridge skipped (the
    // admin accept route will create the profile from the application).
    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
    expect(profilesInsertMock).not.toHaveBeenCalled();
  });
});
