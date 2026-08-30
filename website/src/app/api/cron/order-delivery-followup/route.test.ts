// WS6.4 (R6.F7) + WS6.5 (R6.F8).
//
// F7: the delivered-events query had no time floor and read oldest-first with
// LIMIT 500, while the job's own synthetic 48h-prompt rows share the
// event_type. Once lifetime delivered-shaped events passed 500, new deliveries
// never entered the batch again and the job still reported ok. The query is
// now bounded to the last 14 days.
//
// WS6.4 also gives the prompt a real per-order claim: the prompt row's unique
// idempotency_key is inserted BEFORE the email, so a rerun (or a concurrent
// run) loses the insert with 23505 and skips the send entirely.
//
// F8: an all-failed run now answers 500 and alerts admin instead of a green
// 200 nobody looks at.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, sendTransactionalMock, sendAdminAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendTransactionalMock: vi.fn(async () => ({ sent: true, deduped: false })),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/email/dispatcher", () => ({ sendTransactional: sendTransactionalMock }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { GET } from "./route";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

function req(): Request {
  return new Request("http://localhost/api/cron/order-delivery-followup", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

/** Call log so ordering between the claim insert and the email is provable. */
const calls: string[] = [];
const gteFloors: string[] = [];
const claimInserts: Array<Record<string, unknown>> = [];
const confirmUpserts: Array<Record<string, unknown>> = [];

function setupDb(opts: {
  delivered: Array<{ order_id: string; created_at: string }>;
  closing?: Array<{ order_id: string; event_type: string; idempotency_key: string | null }>;
  orders?: Array<Record<string, unknown>>;
  claimError?: { code?: string; message: string } | null;
}) {
  calls.length = 0;
  gteFloors.length = 0;
  claimInserts.length = 0;
  confirmUpserts.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "order_events") {
      return {
        select: () => ({
          eq: () => ({
            gte: (_col: string, floor: string) => {
              gteFloors.push(floor);
              return {
                order: () => ({
                  limit: async () => ({ data: opts.delivered, error: null }),
                }),
              };
            },
          }),
          in: () => ({ or: async () => ({ data: opts.closing ?? [] }) }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          calls.push("claim");
          claimInserts.push(payload);
          return { error: opts.claimError ?? null };
        },
        upsert: async (payload: Record<string, unknown>) => {
          confirmUpserts.push(payload);
          return { error: null };
        },
      };
    }
    if (table === "orders") {
      return { select: () => ({ in: async () => ({ data: opts.orders ?? [] }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

const BUYER_ROW = {
  id: "ord-1",
  buyer_email: "buyer@x.com",
  status: "delivered",
  shipping: { fullName: "Bob Buyer" },
};

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  fromMock.mockReset();
  sendTransactionalMock.mockClear();
  sendTransactionalMock.mockImplementation(async () => {
    calls.push("email");
    return { sent: true, deduped: false };
  });
  sendAdminAlertMock.mockClear();
});

describe("GET /api/cron/order-delivery-followup", () => {
  it("bounds the delivered query to the last 14 days (R6.F7)", async () => {
    setupDb({ delivered: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    // Fail-before: no gte at all, so the oldest-first LIMIT 500 saturated on
    // lifetime history (including this job's own prompt rows) and new
    // deliveries silently fell out of the batch.
    expect(gteFloors).toHaveLength(1);
    const floorMs = Date.parse(gteFloors[0]!);
    expect(Math.abs(Date.now() - 14 * DAY_MS - floorMs)).toBeLessThan(60_000);
  });

  it("claims the prompt row before sending the email", async () => {
    setupDb({
      delivered: [{ order_id: "ord-1", created_at: iso(3) }],
      orders: [BUYER_ROW],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, prompted: 1, confirmed: 0 });
    expect(calls).toEqual(["claim", "email"]);
    expect(claimInserts[0]).toMatchObject({
      order_id: "ord-1",
      event_type: "order.delivered",
      idempotency_key: "ord-1:48h_prompt",
    });
    expect(sendTransactionalMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "ord-1:48h_prompt", to: "buyer@x.com" }),
    );
  });

  it("skips the email entirely when the claim is already taken (rerun cannot double-send)", async () => {
    setupDb({
      delivered: [{ order_id: "ord-1", created_at: iso(3) }],
      orders: [BUYER_ROW],
      claimError: { code: "23505", message: "duplicate key" },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendTransactionalMock).not.toHaveBeenCalled();
  });

  it("auto-confirms 8-day-old deliveries with the idempotent upsert", async () => {
    setupDb({
      delivered: [{ order_id: "ord-2", created_at: iso(8) }],
      orders: [{ ...BUYER_ROW, id: "ord-2" }],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, prompted: 0, confirmed: 1 });
    expect(confirmUpserts[0]).toMatchObject({
      order_id: "ord-2",
      event_type: "order.delivery_confirmed",
      idempotency_key: "ord-2:order.delivery_confirmed",
    });
    expect(sendTransactionalMock).not.toHaveBeenCalled();
  });

  it("answers 500 and alerts admin when every item failed (WS6.5)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({
      delivered: [{ order_id: "ord-1", created_at: iso(3) }],
      orders: [BUYER_ROW],
      claimError: { code: "42P01", message: "relation does not exist" },
    });
    const res = await GET(req());
    // Fail-before: this was a 200 with {promptedFailed: 1}, invisible on
    // Vercel's cron dashboard.
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, promptedFailed: 1 });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("keeps partial failure at 200 with counts", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({
      delivered: [
        { order_id: "ord-1", created_at: iso(3) },
        { order_id: "ord-2", created_at: iso(8) },
      ],
      orders: [BUYER_ROW, { ...BUYER_ROW, id: "ord-2" }],
      claimError: { code: "42P01", message: "relation does not exist" },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      prompted: 0,
      promptedFailed: 1,
      confirmed: 1,
    });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not prompt an order the closing query says was already prompted", async () => {
    setupDb({
      delivered: [{ order_id: "ord-1", created_at: iso(3) }],
      closing: [{ order_id: "ord-1", event_type: "order.delivered", idempotency_key: "ord-1:48h_prompt" }],
      orders: [BUYER_ROW],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendTransactionalMock).not.toHaveBeenCalled();
    expect(claimInserts).toHaveLength(0);
  });

  it("rejects a caller without the cron bearer", async () => {
    setupDb({ delivered: [] });
    const res = await GET(new Request("http://localhost/api/cron/order-delivery-followup"));
    expect(res.status).toBe(401);
  });
});
