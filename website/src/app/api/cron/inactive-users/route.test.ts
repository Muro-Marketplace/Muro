// WS6.6 (R6.F12, R6.F15) + WS6.5 (R6.F8) + H22/H26.
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
//
// H22: every figure in these emails was a literal. `profileViews: 0`,
// `portfolioStats` of two zeros, `suggestedArtists: []`, `recommendedWorks: []`.
// They are counted from the database now, and a list that comes back empty
// means no email rather than an email promising a list it does not have.
//
// H26: the customer branch is a fallback for "user with neither profile", which
// is exactly what a staff account looks like, so admins were sent "Still enjoy
// the gallery?". Admins are excluded from the sweep.

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  listUsersMock,
  sendEmailMock,
  sendAdminAlertMock,
  whiteGloveProps,
  artist14dProps,
  artist30dProps,
  venue30dProps,
  customer30dProps,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  whiteGloveProps: [] as Array<Record<string, unknown>>,
  artist14dProps: [] as Array<Record<string, unknown>>,
  artist30dProps: [] as Array<Record<string, unknown>>,
  venue30dProps: [] as Array<Record<string, unknown>>,
  customer30dProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { listUsers: listUsersMock } },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

function recorder(into: Array<Record<string, unknown>>) {
  return (props: Record<string, unknown>) => {
    into.push(props);
    return null;
  };
}

vi.mock("@/emails/templates/re-engagement/ArtistInactive14d", () => ({ ArtistInactive14d: recorder(artist14dProps) }));
vi.mock("@/emails/templates/re-engagement/ArtistInactive30d", () => ({ ArtistInactive30d: recorder(artist30dProps) }));
vi.mock("@/emails/templates/re-engagement/ArtistInactive90d", () => ({ ArtistInactive90d: () => null }));
vi.mock("@/emails/templates/re-engagement/VenueInactive30d", () => ({ VenueInactive30d: recorder(venue30dProps) }));
vi.mock("@/emails/templates/re-engagement/VenueInactive90dWhiteGlove", () => ({
  VenueInactive90dWhiteGlove: recorder(whiteGloveProps),
}));
vi.mock("@/emails/templates/re-engagement/CustomerInactive30d", () => ({ CustomerInactive30d: recorder(customer30dProps) }));
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

function inactiveUser(id: string, email: string, days: number): AuthUser {
  return {
    id,
    email,
    last_sign_in_at: new Date(Date.now() - days * DAY_MS).toISOString(),
    user_metadata: { first_name: "Sam" },
  };
}

const INACTIVE_VENUE_USER: AuthUser = {
  id: "u-venue-90",
  email: "venue@x.com",
  last_sign_in_at: new Date(Date.now() - 90 * DAY_MS).toISOString(),
  user_metadata: { first_name: "Vera" },
};

/**
 * PostgREST stub that records the columns and equality predicates it was given.
 *
 * `artist_profiles` is now read three different ways in this route (the page
 * join, the "who joined recently" list, and the work-to-artist join), so the
 * stub has to tell them apart by their select list rather than by table alone.
 */
interface QueryCtx {
  table: string;
  columns: string;
  head: boolean;
  eq: Record<string, unknown>;
}

function builder(table: string, respond: (ctx: QueryCtx) => unknown) {
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

const APPROVED_ARTIST_ROW = {
  id: "ap-1",
  name: "Maya Chen",
  slug: "maya-chen",
  profile_image: "https://img/maya.jpg",
  location: "Hackney, London",
  primary_medium: "Photography",
  created_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
};

const AVAILABLE_WORK_ROW = {
  id: "w-1",
  title: "Last Light on Mare Street",
  image: "https://img/1.jpg",
  artist_id: "ap-1",
  price_band: "From £180",
  dimensions: "50 x 70 cm",
  created_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
};

interface DbOpts {
  artists?: Array<Record<string, unknown>>;
  venues?: Array<Record<string, unknown>>;
  /** Approved artists who joined inside the recent window. */
  recentArtists?: Array<Record<string, unknown>>;
  /** Available works listed inside the recent window. */
  recentWorks?: Array<Record<string, unknown>>;
  /** analytics_events head counts, by event_type. */
  eventCounts?: Record<string, number>;
  /** admin_users rows, i.e. table-only admins with no ADMIN_EMAILS entry. */
  adminUsers?: Array<{ user_id: string }>;
}

function setupProfiles(opts: DbOpts = {}) {
  const {
    artists = [],
    venues = [],
    recentArtists = [APPROVED_ARTIST_ROW],
    recentWorks = [AVAILABLE_WORK_ROW],
    eventCounts = { profile_view: 0, qr_scan: 0 },
    adminUsers = [],
  } = opts;

  fromMock.mockImplementation((table: string) =>
    builder(table, (ctx) => {
      if (table === "artist_profiles") {
        // The page join asks for user_id; the recent-joiners list asks for
        // profile_image; the work join asks for id, name, slug only.
        if (ctx.columns.includes("user_id")) return { data: artists, error: null };
        if (ctx.columns.includes("profile_image")) return { data: recentArtists, error: null };
        return { data: recentArtists.map((a) => ({ id: a.id, name: a.name, slug: a.slug })), error: null };
      }
      if (table === "venue_profiles") return { data: venues, error: null };
      if (table === "artist_works") return { data: recentWorks, error: null };
      if (table === "analytics_events") {
        return { count: eventCounts[String(ctx.eq.event_type)] ?? 0, error: null };
      }
      if (table === "email_events") return { data: [] };
      // H26: admin-auth's batch predicate reads admin_users so a table-only
      // admin is excluded from the sweep, not just an ADMIN_EMAILS one.
      if (table === "admin_users") return { data: adminUsers, error: null };
      throw new Error(`unexpected table ${table}`);
    }),
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAIL;
  fromMock.mockReset();
  listUsersMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  whiteGloveProps.length = 0;
  artist14dProps.length = 0;
  artist30dProps.length = 0;
  venue30dProps.length = 0;
  customer30dProps.length = 0;
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
    setupProfiles();
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when listUsers itself fails, since nothing downstream can run", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listUsersMock.mockResolvedValueOnce({ data: null, error: { message: "auth API down" } });
    setupProfiles();
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

describe("GET /api/cron/inactive-users staff exclusion (H26)", () => {
  it("does not mail an ADMIN_EMAILS account as a lapsed customer", async () => {
    process.env.ADMIN_EMAILS = "ops@wallplace.co.uk, finlay@wallplace.co.uk";
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-admin", "OPS@wallplace.co.uk", 30)] },
      error: null,
    });
    setupProfiles();

    const res = await GET(req());
    // Fail-before: an admin has no artist and no venue profile, so it fell
    // through to the customer branch and got "New pieces worth seeing".
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ adminsSkipped: 1 });
  });

  it("does not mail a TABLE-ONLY admin either (H26 residual)", async () => {
    // The half the allowlist cannot see: admin-auth's predicate is
    // ADMIN_EMAILS OR a row in admin_users, and an admin who was granted
    // access through the table alone still looks exactly like a customer
    // (no artist profile, no venue profile) to this sweep.
    process.env.ADMIN_EMAILS = "";
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-table-admin", "ops2@wallplace.co.uk", 30)] },
      error: null,
    });
    setupProfiles({ adminUsers: [{ user_id: "u-table-admin" }] });

    const res = await GET(req());
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ adminsSkipped: 1 });
  });

  it("matches the allowlist case-insensitively, the way admin-auth does", async () => {
    process.env.ADMIN_EMAILS = "Ops@Wallplace.co.uk";
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-admin", "ops@wallplace.co.uk", 90)] },
      error: null,
    });
    setupProfiles();

    await GET(req());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still mails a genuine lapsed customer", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-cust", "buyer@x.com", 30)] },
      error: null,
    });
    setupProfiles();

    await GET(req());
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: "customer_inactive_30d", to: "buyer@x.com" }),
    );
  });
});

describe("GET /api/cron/inactive-users real figures (H22)", () => {
  it("puts the artist's real 14-day view count in the email, and no venue count", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-artist", "artist@x.com", 14)] },
      error: null,
    });
    setupProfiles({
      artists: [{ user_id: "u-artist", name: "Maya Chen", slug: "maya-chen" }],
      eventCounts: { profile_view: 43, qr_scan: 7 },
    });

    await GET(req());
    expect(artist14dProps).toHaveLength(1);
    // Fail-before: `profileViews: 0` and `nearbyVenues: []` were literals.
    expect(artist14dProps[0]!.profileViews).toBe(43);
    expect(artist14dProps[0]).not.toHaveProperty("nearbyVenues");
  });

  it("puts the artist's real 30-day views and scans in the portfolio snapshot", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-artist", "artist@x.com", 30)] },
      error: null,
    });
    setupProfiles({
      artists: [{ user_id: "u-artist", name: "Maya Chen", slug: "maya-chen" }],
      eventCounts: { profile_view: 178, qr_scan: 22 },
    });

    await GET(req());
    // Fail-before: [{Profile views, 0}, {QR scans, 0}] on every send.
    expect(artist30dProps[0]!.portfolioStats).toEqual([
      { label: "Profile views", value: 178 },
      { label: "QR scans", value: 22 },
    ]);
  });

  it("fills the venue's 30-day email with artists who actually joined", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-venue", "venue@x.com", 30)] },
      error: null,
    });
    setupProfiles({ venues: [{ user_id: "u-venue", name: "The Curzon", slug: "the-curzon" }] });

    await GET(req());
    // Fail-before: `suggestedArtists: []` under a heading promising four.
    const suggested = venue30dProps[0]!.suggestedArtists as Array<Record<string, unknown>>;
    expect(suggested).toHaveLength(1);
    expect(suggested[0]).toMatchObject({
      name: "Maya Chen",
      slug: "maya-chen",
      avatar: "https://img/maya.jpg",
      location: "Hackney, London",
      primaryMedium: "Photography",
    });
  });

  it("sends the venue nothing when no artists joined in the window", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-venue", "venue@x.com", 30)] },
      error: null,
    });
    setupProfiles({
      venues: [{ user_id: "u-venue", name: "The Curzon", slug: "the-curzon" }],
      recentArtists: [],
    });

    await GET(req());
    // Fail-before: the email went anyway, promising artists and listing none.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips an artist row that could not render a card, rather than half-filling it", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-venue", "venue@x.com", 30)] },
      error: null,
    });
    setupProfiles({
      venues: [{ user_id: "u-venue", name: "The Curzon", slug: "the-curzon" }],
      recentArtists: [{ ...APPROVED_ARTIST_ROW, profile_image: null }],
    });

    await GET(req());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("fills the customer's 30-day email with works that are actually listed", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-cust", "buyer@x.com", 30)] },
      error: null,
    });
    setupProfiles();

    await GET(req());
    // Fail-before: `recommendedWorks: []` under "a small curation".
    const works = customer30dProps[0]!.recommendedWorks as Array<Record<string, unknown>>;
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({
      id: "w-1",
      title: "Last Light on Mare Street",
      artistName: "Maya Chen",
      artistSlug: "maya-chen",
      priceLabel: "From £180",
    });
    expect(works[0]!.url).toContain("/browse/maya-chen/last-light-on-mare-street");
  });

  it("sends the customer nothing when there is no new work to show", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-cust", "buyer@x.com", 30)] },
      error: null,
    });
    setupProfiles({ recentWorks: [] });

    await GET(req());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("keeps the day-bucketed idempotency key on every send", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [inactiveUser("u-artist", "artist@x.com", 14)] },
      error: null,
    });
    setupProfiles({
      artists: [{ user_id: "u-artist", name: "Maya Chen", slug: "maya-chen" }],
      eventCounts: { profile_view: 43, qr_scan: 0 },
    });

    await GET(req());
    expect(sendEmailMock.mock.calls[0][0].idempotencyKey).toMatch(/^artist_inactive_14d:u-artist:\d{4}-\d{2}-\d{2}$/);
  });
});
