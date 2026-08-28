// WS6.6 (R6.F14) + WS6.3 (R6.F6c) + WS6.5 (R6.F8).
//
// F14: the digest read exactly yesterday's UTC day, so a missed or failed run
// meant that day's scans were never digested. The window now reaches back
// LOOKBACK_DAYS whole days and buckets per day; the day-bucketed idempotency
// keys make already-covered days no-ops.
//
// F6c: the bell had no dedup while the email did, so a same-day re-run
// double-belled every scanned artist. The bell now carries the same
// day-bucketed key.
//
// F8: an all-failed run answers 500 and alerts admin.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, sendAdminAlertMock, createNotificationMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  createNotificationMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));
vi.mock("@/emails/templates/performance/ArtistQrScanDigest", () => ({ ArtistQrScanDigest: () => null }));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;

function req(): Request {
  return new Request("http://localhost/api/cron/qr-scan-digest", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

/** Noon UTC, `daysAgo` whole days before today 00:00 UTC. */
function scanAt(daysAgo: number): string {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(todayUtc - daysAgo * DAY_MS + 12 * 60 * 60 * 1000).toISOString();
}

function dayKey(daysAgo: number): string {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(todayUtc - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

const gteFloors: string[] = [];

function setupDb(opts: {
  scans: Array<{ artist_slug: string | null; work_id: string | null; venue_name: string | null; created_at: string }>;
  profile?: { user_id: string | null; name: string; slug: string } | null;
}) {
  gteFloors.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "analytics_events") {
      return {
        select: () => ({
          eq: () => ({
            gte: (_col: string, floor: string) => {
              gteFloors.push(floor);
              return { lt: async () => ({ data: opts.scans, error: null }) };
            },
          }),
        }),
      };
    }
    if (table === "artist_works") {
      return { select: () => ({ in: async () => ({ data: [] }) }) };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.profile === undefined
                ? { user_id: "u-artist", name: "Alice Painter", slug: "alice" }
                : opts.profile,
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
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  createNotificationMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "alice@x.com" } } });
});

describe("GET /api/cron/qr-scan-digest catch-up window (R6.F14)", () => {
  it("reaches back three days and still digests a day the cron missed", async () => {
    // Fail-before: the window was yesterday only, so scans from two days ago
    // (a missed run) were never digested by anyone.
    setupDb({ scans: [{ artist_slug: "alice", work_id: null, venue_name: "Kings Arms", created_at: scanAt(2) }] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const floorMs = Date.parse(gteFloors[0]!);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    expect(floorMs).toBe(todayUtc - 3 * DAY_MS);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `qr_scan_digest:u-artist:${dayKey(2)}` }),
    );
  });

  it("buckets per day: one digest per scanned day, each with its own key", async () => {
    setupDb({
      scans: [
        { artist_slug: "alice", work_id: null, venue_name: null, created_at: scanAt(2) },
        { artist_slug: "alice", work_id: null, venue_name: null, created_at: scanAt(1) },
      ],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, days: [dayKey(2), dayKey(1)] });
    const keys = sendEmailMock.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([
      `qr_scan_digest:u-artist:${dayKey(2)}`,
      `qr_scan_digest:u-artist:${dayKey(1)}`,
    ]);
  });

  it("counts an already-covered day as deduped, not sent", async () => {
    setupDb({ scans: [{ artist_slug: "alice", work_id: null, venue_name: null, created_at: scanAt(1) }] });
    sendEmailMock.mockResolvedValue({ ok: true, skipped: true, reason: "duplicate" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 0, deduped: 1, failed: 0 });
  });
});

describe("GET /api/cron/qr-scan-digest bell dedup (R6.F6c)", () => {
  it("keys the bell per artist per day so a re-run cannot double-bell", async () => {
    // Fail-before: the email deduped but the bell did not, so a same-day
    // re-run re-belled every scanned artist.
    setupDb({ scans: [{ artist_slug: "alice", work_id: null, venue_name: "Kings Arms", created_at: scanAt(1) }] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-artist",
        kind: "qr_scan_digest",
        idempotencyKey: `qr_scan_digest:u-artist:${dayKey(1)}`,
      }),
    );
  });
});

describe("GET /api/cron/qr-scan-digest failure observability (WS6.5)", () => {
  it("answers 500 and alerts admin when every digest failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ scans: [{ artist_slug: "alice", work_id: null, venue_name: null, created_at: scanAt(1) }] });
    sendEmailMock.mockResolvedValue({ ok: false, error: "resend down" });
    const res = await GET(req());
    // Fail-before: 200 with a skip count, green on Vercel's dashboard.
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failed: 1 });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("treats a missing artist account as a benign skip, not a failure", async () => {
    setupDb({
      scans: [{ artist_slug: "ghost", work_id: null, venue_name: null, created_at: scanAt(1) }],
      profile: null,
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 0, skipped: 1, failed: 0 });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});
