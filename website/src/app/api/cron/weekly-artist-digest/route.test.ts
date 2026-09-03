// WS6.5 (R6.F8). Representative wiring test for the digest crons: the route
// terminates through finishCronRun, so a run where every digest failed answers
// 500 and alerts admin instead of the old green 200, while a healthy run stays
// 200. (weekly-venue-digest and placement-review-request share the exact same
// terminal; the helper's own matrix lives in ../_auth.test.ts.)
//
// H23. Plus the two numbers this digest used to make up:
//   - "Messages" counted only what was STILL UNREAD at send time, so a message
//     the artist had already read disappeared from their own week, and out of
//     the 3-event gate that decides whether to send at all;
//   - "Top works this week" was a heading over `topWorks: []`, always.

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
vi.mock("@/emails/templates/performance/ArtistWeeklyPortfolioDigest", () => ({
  ArtistWeeklyPortfolioDigest: (props: Record<string, unknown>) => {
    digestProps.push(props);
    return null;
  },
}));

import { GET } from "./route";

function req(): Request {
  return new Request("http://localhost/api/cron/weekly-artist-digest", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

/**
 * A PostgREST query stub that records the predicates it was given.
 *
 * The route now issues several differently-shaped queries against the same two
 * tables (a head count vs a row read of `analytics_events`; messages received vs
 * messages unread), so a fixed chain of nested objects can no longer tell them
 * apart. This records `select()` columns and every `eq()` and hands them to the
 * test's responder, which is what lets a test say "messages WITHOUT the is_read
 * filter is 5, WITH it is 0" and have that mean something.
 */
interface QueryCtx {
  table: string;
  columns: string;
  head: boolean;
  eq: Record<string, unknown>;
}
type Responder = (ctx: QueryCtx) => unknown;

function builder(table: string, respond: Responder) {
  const ctx: QueryCtx = { table, columns: "", head: false, eq: {} };
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const m of ["gte", "lte", "lt", "gt", "in", "is", "not", "like", "or", "order", "limit", "neq", "single", "maybeSingle"]) {
    node[m] = self;
  }
  node.select = (columns = "", opts: { head?: boolean } = {}) => {
    ctx.columns = columns;
    ctx.head = !!opts.head;
    return node;
  };
  node.eq = (column: string, value: unknown) => {
    ctx.eq[column] = value;
    return node;
  };
  node.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve()
      .then(() => respond(ctx))
      .then(onOk, onErr);
  return node;
}

const ARTIST_ROW = {
  user_id: "u-artist",
  name: "Alice Painter",
  slug: "alice",
  created_at: "2026-01-01T00:00:00Z",
  // NULL until the artist touches the switch, which is the state almost every
  // row is in; the cron must read that as "on".
  email_digest_enabled: null as boolean | null,
};

interface DbOpts {
  /** qr_scan rows returned for the top-works aggregation. */
  scanRows?: Array<{ work_id: string | null }>;
  /** artist_works rows the scanned ids resolve to. */
  works?: Array<{ id: string; title: string | null; image: string | null }>;
  messagesReceived?: number;
  messagesUnread?: number;
  qrScanCount?: number;
  /** The artist_profiles row the run walks, so a test can flip the switch. */
  artistRow?: Record<string, unknown>;
}

function setupDb(opts: DbOpts = {}) {
  const {
    scanRows = [],
    works = [],
    messagesReceived = 5,
    messagesUnread = 0,
    qrScanCount = 5,
    artistRow = ARTIST_ROW,
  } = opts;

  fromMock.mockImplementation((table: string) =>
    builder(table, (ctx) => {
      if (table === "artist_profiles") return { data: [artistRow] };
      if (table === "artist_works") return { data: works };
      if (table === "analytics_events") {
        // Head counts vs the row read that feeds topWorks.
        if (ctx.head) return { count: ctx.eq.event_type === "qr_scan" ? qrScanCount : 5, error: null };
        return { data: scanRows, error: null };
      }
      if (table === "messages") {
        return { count: "is_read" in ctx.eq ? messagesUnread : messagesReceived, error: null };
      }
      if (table === "placements") return { count: 5, error: null };
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
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "alice@x.com" } } });
  digestProps.length = 0;
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

describe("GET /api/cron/weekly-artist-digest message counts (H23)", () => {
  it("counts every message received in the week, not only the ones still unread", async () => {
    setupDb({ messagesReceived: 7, messagesUnread: 0 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(digestProps).toHaveLength(1);
    // Fail-before: the only messages query carried .eq("is_read", false), so
    // this was 0 for an artist who had read all seven.
    expect(digestProps[0]!.messages).toBe(7);
  });

  it("describes only the genuinely unread ones as unread", async () => {
    setupDb({ messagesReceived: 7, messagesUnread: 2 });
    await GET(req());
    const actions = digestProps[0]!.recommendedActions as string[];
    expect(actions[0]).toBe("Reply to 2 unread messages");
    expect(actions[0]).not.toContain("7");
  });

  it("falls back to the portfolio prompt when nothing is unread", async () => {
    setupDb({ messagesReceived: 7, messagesUnread: 0 });
    await GET(req());
    const actions = digestProps[0]!.recommendedActions as string[];
    expect(actions[0]).toBe("Add one new piece, artists with 5+ works rank higher");
  });
});

describe("GET /api/cron/weekly-artist-digest top works (H23)", () => {
  it("ranks the week's scanned works instead of shipping an empty list", async () => {
    setupDb({
      scanRows: [
        { work_id: "w-2" },
        { work_id: "w-1" },
        { work_id: "w-1" },
        { work_id: "w-1" },
        { work_id: "w-2" },
        { work_id: "w-3" },
      ],
      works: [
        { id: "w-1", title: "Last Light on Mare Street", image: "https://img/1.jpg" },
        { id: "w-2", title: "The Flower Seller", image: "https://img/2.jpg" },
        { id: "w-3", title: "Low Tide", image: "https://img/3.jpg" },
      ],
    });
    await GET(req());
    // Fail-before: `topWorks: []` was hardcoded, so this was always empty.
    const topWorks = digestProps[0]!.topWorks as Array<Record<string, unknown>>;
    expect(topWorks.map((w) => w.id)).toEqual(["w-1", "w-2", "w-3"]);
    expect(topWorks[0]).toMatchObject({
      title: "Last Light on Mare Street",
      artistName: "Alice Painter",
      artistSlug: "alice",
      image: "https://img/1.jpg",
    });
    expect(topWorks[0]!.url).toContain("/browse/alice/last-light-on-mare-street");
  });

  it("drops a scanned id that resolves to no work, rather than inventing a card", async () => {
    // Legacy QR labels put the work TITLE in work_id, so those ids match no row.
    setupDb({
      scanRows: [{ work_id: "Some Old Title" }, { work_id: "w-1" }],
      works: [{ id: "w-1", title: "Last Light", image: "https://img/1.jpg" }],
    });
    await GET(req());
    const topWorks = digestProps[0]!.topWorks as Array<Record<string, unknown>>;
    expect(topWorks).toHaveLength(1);
    expect(topWorks[0]!.id).toBe("w-1");
  });

  it("drops a work with no image, because the card is image-led", async () => {
    setupDb({
      scanRows: [{ work_id: "w-1" }],
      works: [{ id: "w-1", title: "Last Light", image: null }],
    });
    await GET(req());
    expect(digestProps[0]!.topWorks).toEqual([]);
  });

  it("does not query works at all when the week had no scans", async () => {
    setupDb({ qrScanCount: 0 });
    await GET(req());
    expect(digestProps[0]!.topWorks).toEqual([]);
    expect(fromMock.mock.calls.map(([t]) => t)).not.toContain("artist_works");
  });
});

// Email audit, 2026-09-04. The artist portal's "Weekly digest" switch writes
// artist_profiles.email_digest_enabled (PATCH /api/account/preferences) and
// nothing read it: the only gate was email_preferences.digests_enabled, deep
// inside sendEmail, so the switch the artist could actually see did nothing at
// all. Both are honoured now, and either off means no digest.
describe("GET /api/cron/weekly-artist-digest honours the portal's digest switch", () => {
  it("sends when the profile switch is on", async () => {
    setupDb({ artistRow: { ...ARTIST_ROW, email_digest_enabled: true } });
    await GET(req());
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("sends when the profile switch has never been touched (null)", async () => {
    setupDb({ artistRow: { ...ARTIST_ROW, email_digest_enabled: null } });
    await GET(req());
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the profile switch is off", async () => {
    // Fail-before: the digest went out anyway, and the switch was decorative.
    setupDb({ artistRow: { ...ARTIST_ROW, email_digest_enabled: false } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does no per-artist work at all for a switched-off artist", async () => {
    setupDb({ artistRow: { ...ARTIST_ROW, email_digest_enabled: false } });
    await GET(req());
    // The gate sits before the counting queries, so a muted artist costs one
    // row read rather than five counts.
    expect(fromMock.mock.calls.map(([t]) => t)).toEqual(["artist_profiles"]);
  });

  it("reads the column, so a select that stopped naming it would fail here", async () => {
    const columns: string[] = [];
    fromMock.mockImplementation((table: string) =>
      builder(table, (ctx) => {
        if (table === "artist_profiles") {
          columns.push(ctx.columns);
          return { data: [ARTIST_ROW] };
        }
        if (table === "messages" || table === "placements" || table === "analytics_events") {
          return { count: 5, error: null };
        }
        return { data: [] };
      }),
    );

    await GET(req());

    expect(columns.join(" ")).toContain("email_digest_enabled");
  });

  // The pipeline's own gate is unchanged: email_preferences.digests_enabled is
  // checked inside sendEmail, so "either flag off means no digest" holds
  // without this route knowing anything about that table.
  it("leaves the preference-row gate to the pipeline, sending as the digests category", async () => {
    setupDb();
    await GET(req());
    expect(sendEmailMock.mock.calls[0][0].category).toBe("digests");
  });
});
