// WS3.5 (audit R7 row 14, expiry half). The referral fee-free window used to
// lapse silently; this cron warns the artist a few days ahead. These pin the
// query bounds, the per-(artist, window-end) idempotency key, the skip rules,
// and the all-failed 500.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, bellMock, sendAdminAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ sent: true })),
  bellMock: vi.fn(async () => {}),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/notifications", () => ({ createNotification: bellMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;

function req(): Request {
  return new Request("http://localhost/api/cron/referral-window", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

const bounds: Array<{ op: string; col: string; value: string }> = [];

function setupDb(rows: Array<Record<string, unknown>>, error: { message: string } | null = null) {
  bounds.length = 0;
  fromMock.mockImplementation(() => ({
    select: () => ({
      gt: (col: string, value: string) => {
        bounds.push({ op: "gt", col, value });
        return {
          lte: async (col2: string, value2: string) => {
            bounds.push({ op: "lte", col: col2, value: value2 });
            return { data: error ? null : rows, error };
          },
        };
      },
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  getUserByIdMock.mockResolvedValue({ data: { user: { id: "u-1", email: "fin@x.com" } } });
});

describe("GET /api/cron/referral-window", () => {
  it("warns an expiring artist once, keyed to the artist AND the window end", async () => {
    setupDb([{ id: "ap-1", user_id: "u-1", name: "Fin Coles", free_until: "2026-09-01T12:00:00.000Z" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = (sendEmailMock.mock.calls as unknown as Array<
      [{ idempotencyKey: string; template: string; to: string }]
    >)[0][0];
    expect(call.template).toBe("referral_window_ending");
    expect(call.to).toBe("fin@x.com");
    // The key carries the free_until DAY: a rerun no-ops, an extended window
    // (new date) earns a fresh warning.
    expect(call.idempotencyKey).toBe("referral_window_ending:ap-1:2026-09-01");
    expect(bellMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "referral_window_ending:ap-1:2026-09-01" }),
    );
  });

  it("queries only windows ending between now and now + 4 days", async () => {
    setupDb([]);
    await GET(req());
    expect(bounds.map((b) => `${b.op}:${b.col}`)).toEqual(["gt:free_until", "lte:free_until"]);
    const gt = new Date(bounds[0].value).getTime();
    const lte = new Date(bounds[1].value).getTime();
    expect(lte - gt).toBe(4 * DAY_MS);
    expect(Math.abs(gt - Date.now())).toBeLessThan(10_000);
  });

  it("skips rows without a user or email instead of failing the run", async () => {
    setupDb([
      { id: "ap-1", user_id: null, name: "Orphan", free_until: "2026-09-01T12:00:00.000Z" },
      { id: "ap-2", user_id: "u-2", name: "No Email", free_until: "2026-09-01T12:00:00.000Z" },
    ]);
    getUserByIdMock.mockResolvedValue({ data: { user: { id: "u-2", email: null } } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a broken query answers 500 via the all-failed path", async () => {
    setupDb([], { message: "relation vanished" });
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it("rejects without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/referral-window"));
    expect(res.status).toBe(401);
  });
});
