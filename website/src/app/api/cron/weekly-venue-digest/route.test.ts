// H24. The venue digest shipped `artistMatches: 0` and `suggestedArtists: []`
// on every send, because artist-to-venue matching does not exist. A stat block
// that always reads zero is not a quiet week, it is a product that looks broken,
// so the stat is gone from the template and the cron no longer passes either.
//
// The route's terminal behaviour (finishCronRun) is covered by ../_auth.test.ts
// and the sibling weekly-artist-digest test; this file is about what goes in
// the email.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, sendAdminAlertMock, digestProps } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  digestProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/emails/templates/venue-lifecycle/VenueWeeklyDigest", () => ({
  VenueWeeklyDigest: (props: Record<string, unknown>) => {
    digestProps.push(props);
    return null;
  },
}));

import { GET } from "./route";

function req(): Request {
  return new Request("http://localhost/api/cron/weekly-venue-digest", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

const VENUE_ROW = { user_id: "u-venue", name: "The Curzon", slug: "the-curzon", created_at: "2026-01-01T00:00:00Z" };

function builder(table: string, respond: () => unknown) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const m of ["select", "eq", "gte", "lte", "lt", "in", "is", "not", "or", "order", "limit"]) node[m] = self;
  node.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve().then(respond).then(onOk, onErr);
  void table;
  return node;
}

function setupDb() {
  fromMock.mockImplementation((table: string) =>
    builder(table, () => {
      if (table === "venue_profiles") return { data: [VENUE_ROW] };
      if (table === "analytics_events") return { count: 41, error: null };
      if (table === "placements") return { count: 2, error: null };
      throw new Error(`unexpected table ${table}`);
    }),
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "hannah@x.com" } } });
  digestProps.length = 0;
});

describe("GET /api/cron/weekly-venue-digest (H24)", () => {
  it("sends the digest with only the stats it can count", async () => {
    setupDb();
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(digestProps).toHaveLength(1);
    expect(digestProps[0]).toMatchObject({
      profileViews: 41,
      placementRequests: 2,
      activePlacements: 2,
    });
  });

  it("passes no artistMatches at all, rather than a permanent zero", async () => {
    setupDb();
    await GET(req());
    // Fail-before: `artistMatches: 0` was passed on every single send.
    expect(digestProps[0]).not.toHaveProperty("artistMatches");
  });

  it("passes no empty suggestedArtists list", async () => {
    setupDb();
    await GET(req());
    // Fail-before: `suggestedArtists: []`, which the template then had to guard.
    expect(digestProps[0]).not.toHaveProperty("suggestedArtists");
  });

  it("keeps the idempotency key so a re-run does not double-send", async () => {
    setupDb();
    await GET(req());
    expect(sendEmailMock.mock.calls[0][0].idempotencyKey).toMatch(/^venue_weekly_digest:u-venue:/);
  });
});
