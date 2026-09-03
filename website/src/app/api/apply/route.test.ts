import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

/** The real `artist_applications` columns, from the committed schema snapshot. */
const insertAttempts: Record<string, unknown>[] = [];

const APPLICATION_COLUMNS = new Set<string>(
  (
    JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../../../tests/integration/schema-columns.json"),
        "utf8",
      ),
    ) as Record<string, string[]>
  ).artist_applications,
);

const {
  applicationInsertMock,
  profilesSelectMock,
  profilesSelectBySlugMock,
  profilesSelectByReferralCodeMock,
  profilesInsertMock,
  getAuthenticatedUserMock,
  sendEmailMock,
  notifyAdminMock,
} = vi.hoisted(() => ({
  applicationInsertMock: vi.fn(),
  profilesSelectMock: vi.fn(),
  profilesSelectBySlugMock: vi.fn(),
  profilesSelectByReferralCodeMock: vi.fn(),
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
            // Every ATTEMPT, including one PostgREST would reject. Counting only
            // the successful call would let a strip-and-retry look like a single
            // insert, which is precisely the thing under test.
            insertAttempts.push(payload);
            // PostgREST rejects the WHOLE statement when a row names a column
            // the table lacks. Modelling that is what turns the referral tests
            // below into a reproduction of the failure rather than an
            // assertion about a row's shape. Columns come from the committed
            // schema snapshot, so the fake tracks the real table.
            const unknown = Object.keys(payload).filter((k) => !APPLICATION_COLUMNS.has(k));
            if (unknown.length > 0) {
              return {
                error: {
                  code: "PGRST204",
                  message: `Could not find the '${unknown[0]}' column of 'artist_applications'`,
                },
              };
            }
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
              // Row G L2366: the route resolves a claimed referral code
              // against the codes that actually exist before storing it.
              if (column === "referral_code") {
                return { maybeSingle: async () => profilesSelectByReferralCodeMock() };
              }
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

// K1: was a mock of the legacy `@/lib/email`. The admin ping goes through the
// one pipeline now, via sendAdminAlert.
vi.mock("@/lib/email/admin-alert", () => ({
  sendAdminAlert: (...args: unknown[]) => {
    notifyAdminMock(...args);
    return Promise.resolve({ ok: true, skipped: false, messageId: "m" });
  },
}));

const { welcomeMock } = vi.hoisted(() => ({
  welcomeMock: vi.fn(async (_userId: string) => ({ ok: true, sent: true })),
}));
vi.mock("@/lib/email/welcome", () => ({
  triggerWelcomeIfNeeded: (userId: string) => welcomeMock(userId),
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
  insertAttempts.length = 0;
  profilesSelectMock.mockReset();
  profilesSelectBySlugMock.mockReset();
  profilesSelectByReferralCodeMock.mockReset();
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
  // Default: the claimed code belongs to a real artist, so the tests written
  // before the code was validated still exercise the stored path.
  profilesSelectByReferralCodeMock.mockReturnValue({
    data: { referral_code: "WP-ABC123" },
    error: null,
  });
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

  it("still runs the idempotent profile bridge on a duplicate, so a stuck applicant gets their row", async () => {
    applicationInsertMock.mockReturnValue(DUPLICATE);
    await POST(req());
    expect(profilesInsertMock).toHaveBeenCalledTimes(1);
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


// The referral programme had never recorded a single referral, and a
// strip-and-retry is why nobody noticed.
//
// `api/apply` wrote `referred_by_code` into `artist_applications`. That column
// did not exist: migration 019 added it to `artist_profiles` only. So PostgREST
// rejected the insert, the retry dropped the field and inserted again, the
// application saved, and the code was destroyed. Measured against production: 13
// applications, 7 artists holding a code to share, 0 profiles recording who
// referred them.
//
// Because `referred_by_code: null` still names the column, the FIRST insert
// failed on every application, referred or not.
describe("POST /api/apply records the referral code (migration 109)", () => {
  it("sends referred_by_code on the insert, uppercased", async () => {
    await POST(req({ ...VALID_BODY, referralCode: "wp-abc123" }));

    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
    expect(applicationInsertMock.mock.calls[0][0]).toMatchObject({
      referred_by_code: "WP-ABC123",
    });
  });

  it("sends null rather than omitting the column when there is no code", async () => {
    await POST(req());
    expect(applicationInsertMock.mock.calls[0][0]).toHaveProperty("referred_by_code", null);
  });

  it("ATTEMPTS the insert exactly once, referred or not", async () => {
    // THE regression. Every application used to insert twice: once with the
    // phantom column, once without it and without the referral. Counting
    // attempts rather than successes is the point, or the retry that made the
    // second one succeed reads as a single insert.
    await POST(req({ ...VALID_BODY, referralCode: "WP-ABC123" }));
    expect(insertAttempts).toHaveLength(1);

    insertAttempts.length = 0;
    await POST(req());
    expect(insertAttempts).toHaveLength(1);
  });

  it("names no column the table lacks", async () => {
    // The fake rejects unknown columns the way PostgREST does, so a phantom
    // column makes this a 500 rather than a silently lesser write.
    const res = await POST(req({ ...VALID_BODY, referralCode: "WP-ABC123" }));
    expect(res.status).toBe(200);
  });

  it("surfaces a genuine insert failure instead of retrying into a lossier row", async () => {
    applicationInsertMock.mockReturnValue({
      error: { code: "42501", message: "permission denied" },
    });

    const res = await POST(req({ ...VALID_BODY, referralCode: "WP-ABC123" }));

    expect(res.status).toBe(500);
    expect(insertAttempts).toHaveLength(1);
  });
});

// A50 (QA 2026-08-28). The whole point of auth-gating the application (per
// the signup/artist doc comment: "reject impersonation, instead of trusting
// whatever email the form sent") was never enforced: an authed user could
// file an application, and trigger the acknowledgement email, for any
// address. When the caller is known, the application email must be theirs.
describe("POST /api/apply enforces the authed user's email (A50)", () => {
  it("refuses a signed-in submission for someone else's address", async () => {
    const res = await POST(req({ ...VALID_BODY, email: "victim@example.com" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("finlay@example.com");
    // Nothing is written and nobody is emailed for the impersonated address.
    expect(applicationInsertMock).not.toHaveBeenCalled();
    expect(profilesInsertMock).not.toHaveBeenCalled();
    await flush();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("matches case-insensitively", async () => {
    const res = await POST(req({ ...VALID_BODY, email: "FINLAY@Example.com" }));
    expect(res.status).toBe(200);
    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the legacy unauthenticated path unchecked", async () => {
    getAuthenticatedUserMock.mockReturnValue({ user: null, error: { status: 401 } });
    const res = await POST(req({ ...VALID_BODY, email: "anyone@example.com" }, false));
    expect(res.status).toBe(200);
    expect(applicationInsertMock).toHaveBeenCalledTimes(1);
  });
});

// R4.15 (WS5.5). Both application sends keyed on the bare email address, and
// email_events keys burn on use: a rejected artist whose old application row
// was deleted re-applied and triggered neither the confirmation nor the admin
// alert, silently. The keys now carry the submission's created_at, so each
// accepted application gets its own pair while double-submits stay covered by
// the table's unique-email constraint (the 23505 branch skips both sends).
describe("POST /api/apply application email idempotency keys (R4.15)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keys the receipt and admin ping per submission, not per address", async () => {
    // Fake only Date so the two submissions carry distinct created_at values
    // while flush()'s real setTimeout still runs.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-29T09:00:00.000Z"));

    expect((await POST(req())).status).toBe(200);
    await flush();

    // The re-application: the old row is gone (rejection deleted it), so the
    // insert succeeds again a day later.
    vi.setSystemTime(new Date("2026-08-30T09:00:00.000Z"));
    expect((await POST(req())).status).toBe(200);
    await flush();

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [first, second] = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(first).toMatch(/^artist_application_submitted:finlay@example\.com:.+/);
    // Fail-before: both keys were the bare address, identical, so the second
    // application's receipt was suppressed as a duplicate.
    expect(second).not.toBe(first);

    expect(notifyAdminMock).toHaveBeenCalledTimes(2);
    const [adminFirst, adminSecond] = notifyAdminMock.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(adminFirst).toMatch(/^admin_new_application:finlay@example\.com:.+/);
    expect(adminSecond).not.toBe(adminFirst);
  });

  it("still sends nothing at all on a duplicate submission (unique email)", async () => {
    applicationInsertMock.mockReturnValue({ error: { code: "23505" } });

    const res = await POST(req());
    expect(res.status).toBe(200);
    await flush();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(notifyAdminMock).not.toHaveBeenCalled();
  });
});

// Row G L2366. Application 29 carried the code `QATESTREF`. No artist owns it
// (`select count(*) from artist_profiles where referral_code='QATESTREF'` is 0)
// and it was stored anyway, so the admin reviewing the application saw an
// attribution that could never pay anyone, and `artist_referrals` held 0 rows
// across the whole production database.
describe("POST /api/apply validates the referral code (row G L2366)", () => {
  it("stores a code that a real artist owns", async () => {
    profilesSelectByReferralCodeMock.mockReturnValue({
      data: { referral_code: "REALCODE" },
      error: null,
    });

    await POST(req({ ...VALID_BODY, referralCode: "realcode" }));

    expect(applicationInsertMock.mock.calls[0][0]).toMatchObject({
      referred_by_code: "REALCODE",
    });
  });

  it("drops a code no artist owns rather than storing it as if it were valid", async () => {
    profilesSelectByReferralCodeMock.mockReturnValue({ data: null, error: null });

    const res = await POST(req({ ...VALID_BODY, referralCode: "QATESTREF" }));

    expect(res.status).toBe(200);
    expect(applicationInsertMock.mock.calls[0][0]).toHaveProperty("referred_by_code", null);
  });

  it("does not look a code up when none was given", async () => {
    await POST(req(VALID_BODY));

    expect(profilesSelectByReferralCodeMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/apply sends the welcome checklist once the profile row exists", () => {
  it("triggers the welcome for an authed fresh application, off the response path", async () => {
    welcomeMock.mockClear();
    await POST(req());
    await flush();
    expect(welcomeMock).toHaveBeenCalledWith("user-1");
  });

  it("does not trigger it for an unauthenticated submission", async () => {
    welcomeMock.mockClear();
    getAuthenticatedUserMock.mockReturnValue({ user: null, error: { status: 401 } });
    await POST(req());
    await flush();
    expect(welcomeMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/apply on a duplicate from a signed-in applicant", () => {
  it("still triggers the welcome (idempotent) without re-sending the receipt", async () => {
    welcomeMock.mockClear();
    applicationInsertMock.mockReturnValue({ error: { code: "23505" } });
    await POST(req());
    await flush();
    expect(welcomeMock).toHaveBeenCalledWith("user-1");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
