// WS6.6 (R6.F12, R6.F15) + WS6.5 (R6.F8).
//
// F15: the job read one `listUsers({perPage: 1000})` page, so user 1001+ was
// silently exempt from every re-engagement email forever. It now pages until
// a short page.
//
// F12: the 90-day venue white-glove email linked `${SITE}/venue-portal/curation`,
// a route that has never existed. The real curation entry point is /curated.
//
// F8: an all-failed run answers 500 and alerts admin; a listUsers failure is a
// job-level 500.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, listUsersMock, sendEmailMock, sendAdminAlertMock, whiteGloveProps } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  whiteGloveProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { listUsers: listUsersMock } },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

vi.mock("@/emails/templates/re-engagement/ArtistInactive14d", () => ({ ArtistInactive14d: () => null }));
vi.mock("@/emails/templates/re-engagement/ArtistInactive30d", () => ({ ArtistInactive30d: () => null }));
vi.mock("@/emails/templates/re-engagement/ArtistInactive90d", () => ({ ArtistInactive90d: () => null }));
vi.mock("@/emails/templates/re-engagement/VenueInactive30d", () => ({ VenueInactive30d: () => null }));
vi.mock("@/emails/templates/re-engagement/VenueInactive90dWhiteGlove", () => ({
  VenueInactive90dWhiteGlove: (props: Record<string, unknown>) => {
    whiteGloveProps.push(props);
    return null;
  },
}));
vi.mock("@/emails/templates/re-engagement/CustomerInactive30d", () => ({ CustomerInactive30d: () => null }));
vi.mock("@/emails/templates/re-engagement/CustomerInactive90d", () => ({ CustomerInactive90d: () => null }));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;

function req(): Request {
  return new Request("http://localhost/api/cron/inactive-users", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

type AuthUser = {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  user_metadata: Record<string, unknown>;
};

function activeUser(i: number): AuthUser {
  return {
    id: `u-active-${i}`,
    email: `active${i}@x.com`,
    last_sign_in_at: new Date().toISOString(),
    user_metadata: {},
  };
}

const INACTIVE_VENUE_USER: AuthUser = {
  id: "u-venue-90",
  email: "venue@x.com",
  last_sign_in_at: new Date(Date.now() - 90 * DAY_MS).toISOString(),
  user_metadata: { first_name: "Vera" },
};

function setupProfiles(opts: { venues?: Array<Record<string, unknown>> }) {
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return { select: () => ({ in: async () => ({ data: [] }) }) };
    }
    if (table === "venue_profiles") {
      return { select: () => ({ in: async () => ({ data: opts.venues ?? [] }) }) };
    }
    if (table === "email_events") {
      // sentRecentlyForUser: nothing sent lately.
      return {
        select: () => ({
          eq: () => ({
            like: () => ({
              gte: () => ({ in: () => ({ limit: async () => ({ data: [] }) }) }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  listUsersMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  whiteGloveProps.length = 0;
});

describe("GET /api/cron/inactive-users pagination (R6.F15)", () => {
  it("walks past the first 1000 users and re-engages someone on page 2", async () => {
    // Fail-before: one listUsers({perPage: 1000}) call, so this venue (user
    // 1001) never received any re-engagement email.
    const pageOne = Array.from({ length: 1000 }, (_, i) => activeUser(i));
    listUsersMock
      .mockResolvedValueOnce({ data: { users: pageOne }, error: null })
      .mockResolvedValueOnce({ data: { users: [INACTIVE_VENUE_USER] }, error: null });
    setupProfiles({ venues: [{ user_id: "u-venue-90", name: "Kings Arms", slug: "kings-arms" }] });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, users: 1001 });
    expect(listUsersMock).toHaveBeenCalledTimes(2);
    expect(listUsersMock).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
    expect(listUsersMock).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: "venue_inactive_90d_white_glove", to: "venue@x.com" }),
    );
  });

  it("stops after a short page without asking for another", async () => {
    listUsersMock.mockResolvedValueOnce({ data: { users: [activeUser(1)] }, error: null });
    setupProfiles({});
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when listUsers itself fails, since nothing downstream can run", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listUsersMock.mockResolvedValueOnce({ data: null, error: { message: "auth API down" } });
    setupProfiles({});
    const res = await GET(req());
    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});

describe("GET /api/cron/inactive-users white-glove link (R6.F12)", () => {
  it("points the 90d venue email at /curated, not the dead /venue-portal/curation", async () => {
    listUsersMock.mockResolvedValueOnce({ data: { users: [INACTIVE_VENUE_USER] }, error: null });
    setupProfiles({ venues: [{ user_id: "u-venue-90", name: "Kings Arms", slug: "kings-arms" }] });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(whiteGloveProps).toHaveLength(1);
    const url = whiteGloveProps[0]!.curationRequestUrl as string;
    // Fail-before: `${SITE}/venue-portal/curation`, which 404s.
    expect(url.endsWith("/curated")).toBe(true);
    expect(url).not.toContain("venue-portal/curation");
  });
});

describe("GET /api/cron/inactive-users failure observability (WS6.5)", () => {
  it("answers 500 and alerts admin when every item failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listUsersMock.mockResolvedValueOnce({ data: { users: [INACTIVE_VENUE_USER] }, error: null });
    setupProfiles({ venues: [{ user_id: "u-venue-90", name: "Kings Arms", slug: "kings-arms" }] });
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
