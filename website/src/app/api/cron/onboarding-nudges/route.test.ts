// WS6.6 (R6.F14) + WS6.5 (R6.F8).
//
// F14: inDayWindow was exact equality (`days >= target && days <= target`)
// despite its "±12h" comment, so one missed or failed daily run permanently
// dropped that day's cohort. Each nudge now has a 3-day window, and the
// HIGHEST covering target wins so an on-time cohort is never swallowed by the
// previous nudge's catch-up tail. The once-ever idempotency keys absorb the
// overlap.
//
// F8: an all-failed run answers 500 and alerts admin.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, sendAdminAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

// Templates are React components; the route only builds them as payloads.
vi.mock("@/emails/templates/onboarding/artist/ArtistProfileCompletionNudge", () => ({ ArtistProfileCompletionNudge: () => null }));
vi.mock("@/emails/templates/onboarding/artist/ArtistFirstArtworkUploadNudge", () => ({ ArtistFirstArtworkUploadNudge: () => null }));
vi.mock("@/emails/templates/onboarding/artist/ArtistConnectStripeNudge", () => ({ ArtistConnectStripeNudge: () => null }));
vi.mock("@/emails/templates/onboarding/artist/ArtistPlacementPreferencesNudge", () => ({ ArtistPlacementPreferencesNudge: () => null }));
vi.mock("@/emails/templates/onboarding/artist/ArtistOnboardingGraduation", () => ({ ArtistOnboardingGraduation: () => null }));
vi.mock("@/emails/templates/onboarding/artist/ArtistOnboardingIncompleteRecap", () => ({ ArtistOnboardingIncompleteRecap: () => null }));
vi.mock("@/emails/templates/onboarding/venue/VenueSpaceDetailsNudge", () => ({ VenueSpaceDetailsNudge: () => null }));
vi.mock("@/emails/templates/onboarding/venue/VenuePhotoUploadNudge", () => ({ VenuePhotoUploadNudge: () => null }));
vi.mock("@/emails/templates/onboarding/venue/VenueArtPreferencesNudge", () => ({ VenueArtPreferencesNudge: () => null }));
vi.mock("@/emails/templates/onboarding/venue/VenueFirstPlacementCta", () => ({ VenueFirstPlacementCta: () => null }));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

function req(): Request {
  return new Request("http://localhost/api/cron/onboarding-nudges", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

type ArtistRow = Record<string, unknown>;
type VenueRow = Record<string, unknown>;

function bareArtist(daysAgo: number, overrides: ArtistRow = {}): ArtistRow {
  return {
    id: "ap-1",
    user_id: "u-artist",
    name: "Alice Painter",
    slug: "alice",
    created_at: iso(daysAgo),
    short_bio: null,
    profile_image: null,
    primary_medium: null,
    stripe_connect_account_id: null,
    venue_types_suited_for: [],
    themes: [],
    ...overrides,
  };
}

function setupDb(opts: { artists?: ArtistRow[]; venues?: VenueRow[]; worksCount?: number }) {
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return { select: () => ({ gte: () => ({ not: async () => ({ data: opts.artists ?? [] }) }) }) };
    }
    if (table === "venue_profiles") {
      return { select: () => ({ gte: () => ({ not: async () => ({ data: opts.venues ?? [] }) }) }) };
    }
    if (table === "artist_works") {
      return { select: () => ({ eq: async () => ({ count: opts.worksCount ?? 0 }) }) };
    }
    if (table === "placements") {
      return { select: () => ({ eq: async () => ({ count: 0 }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "someone@x.com", user_metadata: {} } } });
});

function sentTemplates(): string[] {
  return sendEmailMock.mock.calls.map((c) => (c[0] as { template: string }).template);
}

describe("GET /api/cron/onboarding-nudges day windows (R6.F14)", () => {
  it("catches a day-3 artist with the day-2 nudge after a missed run", async () => {
    // Fail-before: exact equality meant days=3 matched nothing, so a single
    // missed daily run dropped the cohort forever.
    setupDb({ artists: [bareArtist(3)] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sentTemplates()).toEqual(["artist_profile_completion_nudge"]);
  });

  it("sends the day-4 nudge on day 4, not the day-2 catch-up", async () => {
    // The day-2 window now stretches to day 4; the higher target must win or
    // the on-time day-4 cohort would no-op on the day-2 idempotency key.
    setupDb({ artists: [bareArtist(4)], worksCount: 0 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sentTemplates()).toEqual(["artist_first_artwork_upload_nudge"]);
  });

  it("catches a day-16 artist with the day-14 recap", async () => {
    setupDb({ artists: [bareArtist(16)], worksCount: 0 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sentTemplates()).toEqual(["artist_onboarding_incomplete_recap"]);
  });

  it("sends nothing outside every window", async () => {
    setupDb({ artists: [bareArtist(17)] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("catches a day-3 venue with the day-2 space-details nudge", async () => {
    setupDb({
      venues: [{
        user_id: "u-venue",
        name: "Kings Arms",
        slug: "kings-arms",
        created_at: iso(3),
        description: null,
        images: [],
        preferred_styles: [],
        approximate_footfall: null,
      }],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sentTemplates()).toEqual(["venue_space_details_nudge"]);
  });
});

describe("GET /api/cron/onboarding-nudges failure observability (WS6.5)", () => {
  it("answers 500 and alerts admin when every nudge failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ artists: [bareArtist(3)] });
    sendEmailMock.mockRejectedValue(new Error("resend down"));
    const res = await GET(req());
    // Fail-before: 200 with {failed: 1}, green on Vercel's dashboard.
    expect(res.status).toBe(500);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("keeps partial failure at 200 with per-batch counts", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ artists: [bareArtist(3), bareArtist(3, { id: "ap-2", user_id: "u-artist-2" })] });
    sendEmailMock
      .mockRejectedValueOnce(new Error("resend blip"))
      .mockResolvedValueOnce({ ok: true, skipped: false, messageId: "m-2" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, artist: { succeeded: 1, failed: 1 } });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
