// D60, option (b). This cron was gated off because `placements.end_date` did
// not exist, so it had never sent an email. Migration 136 adds the column and
// this is the real job.
//
// What these pin, in order of how badly each would hurt:
//
//   - the key is per placement, per party, per end date, so a re-run cannot
//     double-send and a moved date DOES earn a fresh reminder;
//   - both parties are emailed, separately, so one opt-out cannot silence the
//     other;
//   - the query only walks placements that are on the wall;
//   - nothing here writes `status` (the migration is explicit that reaching
//     the date ends nothing);
//   - an all-failed run answers 500 and alerts admin (WS6.5).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock, sendAdminAlertMock, createNotificationMock } =
  vi.hoisted(() => ({
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
vi.mock("@/emails/templates/placements/PlacementEndingSoon", () => ({
  PlacementEndingSoon: vi.fn(() => null),
}));

import { GET, CATCHUP_DAYS, NOTICE_DAYS, ON_THE_WALL_STATUSES } from "./route";
import { PlacementEndingSoon } from "@/emails/templates/placements/PlacementEndingSoon";
import { plainDateInDays } from "@/lib/placements/end-date";

const ARTIST = "u-artist";
const VENUE = "u-venue";

function req(): Request {
  return new Request("http://localhost/api/cron/placement-ending-soon", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

type PlacementRow = {
  id: string;
  artist_user_id: string | null;
  venue_user_id: string | null;
  venue: string | null;
  end_date: string | null;
};

/** What the route actually asked `placements` for, so the filter can be asserted. */
const queried: {
  statuses?: string[];
  collectedAtIsNull?: boolean;
  gte?: [string, string];
  lte?: [string, string];
} = {};

function setupDb(opts: { placements: PlacementRow[]; venueName?: string | null }) {
  delete queried.statuses;
  delete queried.collectedAtIsNull;
  delete queried.gte;
  delete queried.lte;
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      const chain = {
        select: () => chain,
        in: (col: string, values: string[]) => {
          if (col === "status") queried.statuses = values;
          return chain;
        },
        is: (col: string, value: unknown) => {
          if (col === "collected_at" && value === null) queried.collectedAtIsNull = true;
          return chain;
        },
        gte: (col: string, value: string) => {
          queried.gte = [col, value];
          return chain;
        },
        lte: (col: string, value: string) => {
          queried.lte = [col, value];
          return chain;
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: opts.placements, error: null }).then(resolve, reject),
      };
      return chain;
    }
    if (table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.venueName === undefined ? { name: "The Curzon" } : opts.venueName === null ? null : { name: opts.venueName },
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

/** A placement whose end date is exactly the 14-day notice mark. */
function endingInNoticeWindow(over: Partial<PlacementRow> = {}): PlacementRow {
  return {
    id: "pl-1",
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    venue: "Kings Arms",
    end_date: plainDateInDays(NOTICE_DAYS),
    ...over,
  };
}

function sendArgs(index: number) {
  return sendEmailMock.mock.calls[index][0] as {
    idempotencyKey: string;
    template: string;
    category: string;
    to: string;
    subject: string;
    userId: string;
    metadata: Record<string, unknown>;
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendAdminAlertMock.mockClear();
  createNotificationMock.mockClear();
  vi.mocked(PlacementEndingSoon).mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockImplementation(async (id: string) => ({
    data: { user: { email: `${id}@example.com`, user_metadata: { first_name: id === ARTIST ? "Maya" : "Sam" } } },
  }));
});

describe("GET /api/cron/placement-ending-soon auth", () => {
  it("refuses a caller with no cron secret", async () => {
    setupDb({ placements: [] });
    const res = await GET(new Request("http://localhost/api/cron/placement-ending-soon"));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/placement-ending-soon selection", () => {
  it("only walks placements that are on the wall and not collected", async () => {
    setupDb({ placements: [] });

    await GET(req());

    expect(queried.statuses).toEqual([...ON_THE_WALL_STATUSES]);
    expect(queried.statuses).not.toContain("cancelled");
    expect(queried.statuses).not.toContain("completed");
    expect(queried.collectedAtIsNull).toBe(true);
  });

  it("scans end_date from the catch-up floor up to the 14-day mark", async () => {
    setupDb({ placements: [] });

    await GET(req());

    expect(queried.gte).toEqual(["end_date", plainDateInDays(NOTICE_DAYS - CATCHUP_DAYS)]);
    expect(queried.lte).toEqual(["end_date", plainDateInDays(NOTICE_DAYS)]);
  });

  it("reports an empty window without sending anything", async () => {
    setupDb({ placements: [] });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 0, reason: "no_placements_ending" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("500s on a query failure rather than reporting a healthy empty run", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockImplementation(() => {
      const chain = {
        select: () => chain,
        in: () => chain,
        is: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "column does not exist" } }).then(resolve),
      };
      return chain;
    });

    const res = await GET(req());

    // Fail-before: this is exactly how the pre-136 route looked healthy for
    // months while sending nothing.
    expect(res.status).toBe(500);
    expect(sendEmailMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("GET /api/cron/placement-ending-soon sends", () => {
  it("emails both parties, separately, under the placements category", async () => {
    setupDb({ placements: [endingInNoticeWindow()] });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, failed: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendArgs(0)).toMatchObject({
      template: "placement_ending_soon",
      category: "placements",
      to: `${ARTIST}@example.com`,
      userId: ARTIST,
    });
    expect(sendArgs(1)).toMatchObject({ to: `${VENUE}@example.com`, userId: VENUE });
  });

  it("keys per placement, per party, per end date", async () => {
    const endDate = plainDateInDays(NOTICE_DAYS);
    setupDb({ placements: [endingInNoticeWindow({ end_date: endDate })] });

    await GET(req());

    expect(sendArgs(0).idempotencyKey).toBe(`placement_ending_soon:pl-1:${ARTIST}:${endDate}`);
    expect(sendArgs(1).idempotencyKey).toBe(`placement_ending_soon:pl-1:${VENUE}:${endDate}`);
  });

  it("gives a moved end date a fresh key, so the new date is reminded once", async () => {
    const first = plainDateInDays(NOTICE_DAYS);
    setupDb({ placements: [endingInNoticeWindow({ end_date: first })] });
    await GET(req());
    const before = sendArgs(0).idempotencyKey;

    sendEmailMock.mockClear();
    const moved = plainDateInDays(NOTICE_DAYS - 1);
    setupDb({ placements: [endingInNoticeWindow({ end_date: moved })] });
    await GET(req());

    expect(sendArgs(0).idempotencyKey).not.toBe(before);
    expect(sendArgs(0).idempotencyKey).toContain(moved);
  });

  it("names the venue and the date in the subject and the template props", async () => {
    setupDb({ placements: [endingInNoticeWindow({ end_date: "2026-05-08" })], venueName: "The Curzon" });

    await GET(req());

    expect(sendArgs(0).subject).toBe("Placement at The Curzon ends 8 May 2026");
    const props = vi.mocked(PlacementEndingSoon).mock.calls[0][0];
    expect(props).toMatchObject({
      firstName: "Maya",
      venueName: "The Curzon",
      endDate: "8 May 2026",
      placementUrl: "https://wallplace.co.uk/placements/pl-1",
      returnInstructionsUrl: "https://wallplace.co.uk/placements/pl-1?record=open",
      extendPlacementUrl: "https://wallplace.co.uk/placements/pl-1?extend=1",
    });
  });

  it("falls back to the placement's stored venue name when there is no venue profile", async () => {
    setupDb({ placements: [endingInNoticeWindow({ end_date: "2026-05-08" })], venueName: null });

    await GET(req());

    expect(sendArgs(0).subject).toBe("Placement at Kings Arms ends 8 May 2026");
  });

  it("bells each party under the same key as their email", async () => {
    const endDate = plainDateInDays(NOTICE_DAYS);
    setupDb({ placements: [endingInNoticeWindow({ end_date: endDate })] });

    await GET(req());

    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ARTIST,
        kind: "placement_ending_soon",
        idempotencyKey: `placement_ending_soon:pl-1:${ARTIST}:${endDate}`,
      }),
    );
  });

  it("counts a duplicate as deduped, not sent, so a re-run is a no-op", async () => {
    setupDb({ placements: [endingInNoticeWindow()] });
    sendEmailMock.mockResolvedValue({ ok: true, skipped: true, reason: "duplicate" });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 0, deduped: 2, failed: 0 });
  });

  it("still reminds the venue when the placement has no artist account", async () => {
    setupDb({ placements: [endingInNoticeWindow({ artist_user_id: null })] });

    await GET(req());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendArgs(0).userId).toBe(VENUE);
  });

  it("treats a party with no reachable address as a benign skip", async () => {
    setupDb({ placements: [endingInNoticeWindow()] });
    getUserByIdMock.mockImplementation(async (id: string) =>
      id === ARTIST ? { data: { user: null } } : { data: { user: { email: "v@example.com", user_metadata: {} } } },
    );

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 1, skipped: 1, failed: 0 });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("skips a row whose end_date is unreadable instead of emailing a broken date", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ placements: [endingInNoticeWindow({ end_date: "not-a-date" })] });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never writes to placements: the date reminds, it does not end anything", async () => {
    setupDb({ placements: [endingInNoticeWindow()] });

    await GET(req());

    // The mock throws on any table it does not know, and `placements` only
    // exposes a read chain, so a status write would have blown up. Assert the
    // intent explicitly too, since this is the migration's central rule.
    const placementsChain = fromMock.mock.results
      .map((r) => r.value as Record<string, unknown>)
      .filter((v) => typeof v?.gte === "function");
    for (const chain of placementsChain) {
      expect(chain.update).toBeUndefined();
    }
  });
});

describe("GET /api/cron/placement-ending-soon failure observability (WS6.5)", () => {
  it("answers 500 and alerts admin when every send failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ placements: [endingInNoticeWindow()] });
    sendEmailMock.mockResolvedValue({ ok: false, error: "resend down" });

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failed: 2 });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("stays 200 when only one of the two parties failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ placements: [endingInNoticeWindow()] });
    sendEmailMock
      .mockResolvedValueOnce({ ok: false, error: "bounced" })
      .mockResolvedValueOnce({ ok: true, skipped: false, messageId: "m-2" });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 1, failed: 1 });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
