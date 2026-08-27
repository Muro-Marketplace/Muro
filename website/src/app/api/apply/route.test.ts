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

// 074/X3: the artist_applications insert moved OFF the anon client onto this one,
// because 074 drops both WITH CHECK (true) INSERT policies on that table. The old
// "@/lib/supabase" mock was deleted rather than left beside this one, so a route
// that quietly went back to the anon client fails here instead of passing on a
// stale mock.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "artist_applications") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            // The return value comes from the mock so a test can drive the
            // 23505 / real-failure branches (E36d). Defaults to success so the
            // tests written before that stay unchanged.
            return applicationInsertMock(payload) ?? { error: null };
          },
        };
      }
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
  notifyAdminNewApplication: (...args: unknown[]) => {
    notifyAdminMock(...args);
    return Promise.resolve();
  },
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


/**
 * Let the afterResponse task run. The handler deliberately does not await the
 * sends (E36d: awaiting them is what made the duplicate branch measurably
 * faster), so without this the "not called" assertions would pass vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

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

describe("POST /api/apply is not an account-existence oracle (E36d)", () => {
  const DUPLICATE = { error: { code: "23505", message: "duplicate key" } };

  it("answers a duplicate email byte-identically to a fresh application", async () => {
    const freshRes = await POST(req());
    const fresh = { status: freshRes.status, body: await freshRes.text() };

    applicationInsertMock.mockReturnValue(DUPLICATE);
    const dupRes = await POST(req());
    const duplicate = { status: dupRes.status, body: await dupRes.text() };

    expect(duplicate).toEqual(fresh);
    expect(duplicate.status).toBe(200);
  });

  it("never answers 409 on a unique-constraint violation", async () => {
    applicationInsertMock.mockReturnValue(DUPLICATE);
    const res = await POST(req());
    expect(res.status).not.toBe(409);
    expect(await res.text()).not.toContain("already exists");
  });

  it("does not re-notify the admin or re-send the receipt on a duplicate", async () => {
    // Otherwise the endpoint mails anyone whose address you can guess, and
    // spams the admin inbox on demand.
    applicationInsertMock.mockReturnValue(DUPLICATE);
    await POST(req());
    await flush();
    expect(notifyAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does not re-run the profile bridge on a duplicate", async () => {
    applicationInsertMock.mockReturnValue(DUPLICATE);
    await POST(req());
    expect(profilesInsertMock).not.toHaveBeenCalled();
  });

  it("still sends both on a fresh application", async () => {
    await POST(req());
    await flush();
    expect(notifyAdminMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("still surfaces a genuine database failure as a 500", async () => {
    // The oracle fix must not swallow real errors into a fake success.
    applicationInsertMock.mockReturnValue({ error: { code: "42501", message: "permission denied" } });
    const res = await POST(req());
    await flush();
    expect(res.status).toBe(500);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
