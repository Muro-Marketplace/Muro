// 09 §A.6 layer 3 (item 0.3). The boot assertion only catches a key missing at
// start-up; this catches one revoked later, and any send actually dropped for
// want of a key. It must return 503 in those cases so a monitor pages, and must
// never echo the values themselves (it is unauthenticated by design).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { GET } from "./route";

const FULL_ENV = {
  RESEND_API_KEY: "re_123",
  EMAIL_FROM_TX: "a@tx.example",
  EMAIL_FROM_NOTIFY: "b@tx.example",
  EMAIL_FROM_NEWS: "c@tx.example",
  CRON_SECRET: "s3cret",
  SUPABASE_WEBHOOK_SECRET: "whsec",
  RESEND_WEBHOOK_SECRET: "whsec_resend",
};

/** counts: status -> rows in the last 24h. Anything unlisted answers 0. */
function setupCounts(counts: Record<string, number> = {}, opts: { fail?: boolean } = {}) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: (_col: string, status: string) => ({
        gte: async () =>
          opts.fail
            ? { count: null, error: { message: "connection refused" } }
            : { count: counts[status] ?? 0, error: null },
      }),
    }),
  }));
}

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.clearAllMocks();
});
beforeEach(() => {
  process.env = { ...ORIGINAL, ...FULL_ENV };
  setupCounts();
});

describe("GET /api/health/email", () => {
  it("is 200 and healthy when config is complete and nothing was dropped", async () => {
    setupCounts({ sent: 42 });
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.healthy).toBe(true);
    expect(body.last24h.sent).toBe(42);
  });

  it("is 503 when a required env var is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.env.RESEND_API_KEY).toBe(false);
  });

  it("treats a blank env var as missing", async () => {
    process.env.EMAIL_FROM_TX = "   ";
    const res = await GET();

    expect(res.status).toBe(503);
    expect((await res.json()).env.EMAIL_FROM_TX).toBe(false);
  });

  it("is 503 when any send was dropped for a missing key in the last 24h", async () => {
    // The key can be present now and still have dropped mail an hour ago.
    setupCounts({ sent: 10, skipped_no_api_key: 3 });
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.last24h.skipped_no_api_key).toBe(3);
  });

  // WS5.4 (R4.8): the healthy verdict used to ignore failed / render_failed
  // entirely and did not even count dry_run, so a day of 100 per cent provider
  // failures, a broken template, or a leaked EMAIL_DRY_RUN all left this route
  // returning 200 healthy through a total outage.
  it("is 503 when any send failed at the provider in the last 24h", async () => {
    setupCounts({ sent: 40, failed: 2 });
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.last24h.failed).toBe(2);
  });

  it("is 503 when any render failed in the last 24h", async () => {
    setupCounts({ sent: 40, render_failed: 1 });
    const res = await GET();

    expect(res.status).toBe(503);
    expect((await res.json()).healthy).toBe(false);
  });

  it("is 503 when any dry_run row exists, surfacing a leaked EMAIL_DRY_RUN", async () => {
    setupCounts({ sent: 40, dry_run: 3 });
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.last24h.dry_run).toBe(3);
  });

  it("is 503 when RESEND_WEBHOOK_SECRET is missing (suppressions pipeline dead)", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.env.RESEND_WEBHOOK_SECRET).toBe(false);
  });

  it("is 503, not a false all-clear, when the database cannot be reached", async () => {
    setupCounts({}, { fail: true });
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.dbReachable).toBe(false);
  });

  it("reports presence only, never the secret values", async () => {
    const body = await (await GET()).json();
    const serialised = JSON.stringify(body);

    for (const v of Object.values(FULL_ENV)) {
      expect(serialised).not.toContain(v);
    }
    expect(Object.values(body.env).every((v) => typeof v === "boolean")).toBe(true);
  });
});
