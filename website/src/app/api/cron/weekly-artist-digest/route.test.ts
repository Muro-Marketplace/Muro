// WS6.5 (R6.F8). Representative wiring test for the digest crons: the route
// terminates through finishCronRun, so a run where every digest failed answers
// 500 and alerts admin instead of the old green 200, while a healthy run stays
// 200. (weekly-venue-digest and placement-review-request share the exact same
// terminal; the helper's own matrix lives in ../_auth.test.ts.)

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
vi.mock("@/emails/templates/performance/ArtistWeeklyPortfolioDigest", () => ({ ArtistWeeklyPortfolioDigest: () => null }));

import { GET } from "./route";

function req(): Request {
  return new Request("http://localhost/api/cron/weekly-artist-digest", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function setupDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({
          not: () => ({
            lte: async () => ({
              data: [{ user_id: "u-artist", name: "Alice Painter", slug: "alice", created_at: "2026-01-01T00:00:00Z" }],
            }),
          }),
        }),
      };
    }
    // Count queries (analytics_events, messages, placements): enough events
    // to clear the 3-event digest gate.
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: async () => ({ count: 5 }),
            eq: () => ({ gte: async () => ({ count: 5 }) }),
          }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "alice@x.com" } } });
});

describe("GET /api/cron/weekly-artist-digest failure observability (WS6.5)", () => {
  it("stays 200 when the digest sends", async () => {
    setupDb();
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, succeeded: 1, failed: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("answers 500 and alerts admin when every digest failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb();
    sendEmailMock.mockRejectedValue(new Error("resend down"));
    const res = await GET(req());
    // Fail-before: 200 with {failed: 1}, invisible on Vercel's dashboard.
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, succeeded: 0, failed: 1 });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
