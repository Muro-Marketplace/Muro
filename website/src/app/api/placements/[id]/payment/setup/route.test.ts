// E7b (04 §B6). Two defects in one route:
//
//   1. No Stripe idempotency key on session creation, so two clicks meant two
//      live subscriptions and two monthly charges for one placement.
//   2. The dedup guard read placements.stripe_subscription_id, which until E7a
//      was written by nothing, so it was permanently false.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionsCreateMock, fromMock, getUserMock, assertNotDemoMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: "cs_1", url: "https://stripe.example/pay" })),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  assertNotDemoMock: vi.fn(() => null),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock } } },
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getUserMock }));
vi.mock("@/lib/demo-guard", () => ({ assertNotDemo: assertNotDemoMock }));

import { POST } from "./route";

const PLACEMENT = {
  id: "pl-1",
  venue_user_id: "u-venue",
  artist_user_id: "u-artist",
  work_title: "Sand Dunes",
  monthly_fee_gbp: 45,
  stripe_subscription_id: null as string | null,
};

interface DbState {
  placement: Record<string, unknown> | null;
  /** Rows the placement_recurring_billings lookup returns. */
  billings: Array<Record<string, unknown>>;
  /** Filters the billings query was scoped by, so the guard's shape is assertable. */
  billingFilters: Array<[string, unknown]>;
}

let state: DbState;

function setupDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.placement }) }) }),
      };
    }
    if (table === "placement_recurring_billings") {
      const chain = {
        eq: (col: string, val: unknown) => {
          state.billingFilters.push([col, val]);
          return chain;
        },
        neq: (col: string, val: unknown) => {
          state.billingFilters.push([`neq:${col}`, val]);
          return chain;
        },
        limit: async () => ({ data: state.billings, error: null }),
        // maybeSingle is deliberately NOT provided: if the route reverts to it,
        // this test file fails loudly rather than silently passing.
      };
      return { select: () => chain };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { name: "Maya", stripe_connect_account_id: "acct_1", subscription_plan: "core", trial_end: null },
            }),
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  });
}

const post = (id = "pl-1") =>
  POST(new Request(`http://localhost/api/placements/${id}/payment/setup`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  state = { placement: { ...PLACEMENT }, billings: [], billingFilters: [] };
  fromMock.mockReset();
  sessionsCreateMock.mockClear();
  assertNotDemoMock.mockReturnValue(null);
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({
    user: { id: "u-venue", email: "venue@example.com" },
    error: null,
  });
  setupDb();
});

describe("POST /api/placements/[id]/payment/setup idempotency (E7b)", () => {
  it("sends an idempotency key so two clicks cannot mint two subscriptions", async () => {
    expect((await post()).status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const [, options] = sessionsCreateMock.mock.calls[0] as unknown as [unknown, { idempotencyKey?: string }];
    expect(options?.idempotencyKey).toBeTruthy();
    expect(options!.idempotencyKey).toContain("paid_loan_setup:pl-1");
  });

  it("uses the same key for two attempts in the same window", async () => {
    await post();
    await post();
    const keys = (sessionsCreateMock.mock.calls as unknown as Array<[unknown, { idempotencyKey: string }]>).map(
      (c) => c[1].idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("changes the key when the monthly fee changes", async () => {
    // A repeated key with different parameters is an idempotency ERROR from
    // Stripe, which would surface as the route's generic 500. Including the
    // amount means an edited fee gets a fresh key instead of a failure.
    await post();
    state.placement = { ...PLACEMENT, monthly_fee_gbp: 60 };
    await post();
    const keys = (sessionsCreateMock.mock.calls as unknown as Array<[unknown, { idempotencyKey: string }]>).map(
      (c) => c[1].idempotencyKey,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("keeps the amount in the key consistent with the line item", async () => {
    await post();
    const [params, options] = sessionsCreateMock.mock.calls[0] as unknown as [
      { line_items: Array<{ price_data: { unit_amount: number } }> },
      { idempotencyKey: string },
    ];
    expect(params.line_items[0].price_data.unit_amount).toBe(4500);
    expect(options.idempotencyKey).toContain(":4500:");
  });
});

describe("POST /api/placements/[id]/payment/setup dedup guard (E7b)", () => {
  it("refuses when a live billing row already exists, and creates no session", async () => {
    state.billings = [{ id: "b1", stripe_subscription_id: "sub_1", status: "active" }];
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("already set up") });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("queries the ledger by placement and excludes cancelled rows", async () => {
    await post();
    expect(state.billingFilters).toEqual([
      ["placement_id", "pl-1"],
      ["neq:status", "cancelled"],
    ]);
  });

  it("still refuses on the placements mirror alone", async () => {
    // The mirror is best-effort inside recordPaidLoanSubscription, so the ledger
    // may be written while the mirror is not, and vice versa. Either blocks.
    state.placement = { ...PLACEMENT, stripe_subscription_id: "sub_1" };
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("proceeds when the only billing row is cancelled", async () => {
    // A cancelled subscription must be re-startable, otherwise a venue who
    // paused a loan can never resume it. The route filters those out in SQL, so
    // the lookup returns nothing.
    state.billings = [];
    expect((await post()).status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("proceeds when a row exists with no subscription id yet", async () => {
    // A half-written ledger row is not a live subscription.
    state.billings = [{ id: "b1", stripe_subscription_id: null, status: "active" }];
    expect((await post()).status).toBe(200);
  });

  it("refuses when two live rows exist, rather than erroring on maybeSingle", async () => {
    // placement_recurring_billings has no unique index on placement_id, so two
    // rows are possible. .maybeSingle() would raise PGRST116, hand back null, and
    // the guard would wave through a third subscription.
    state.billings = [
      { id: "b1", stripe_subscription_id: "sub_1", status: "active" },
      { id: "b2", stripe_subscription_id: "sub_2", status: "past_due" },
    ];
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/placements/[id]/payment/setup existing guards still hold", () => {
  it("404s an unknown placement", async () => {
    state.placement = null;
    expect((await post()).status).toBe(404);
  });

  it("403s anyone who is not the venue", async () => {
    getUserMock.mockResolvedValue({ user: { id: "u-someone-else", email: "x@y.z" }, error: null });
    expect((await post()).status).toBe(403);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("400s a placement with no monthly fee", async () => {
    state.placement = { ...PLACEMENT, monthly_fee_gbp: 0 };
    expect((await post()).status).toBe(400);
  });

  it("returns the demo response without touching Stripe", async () => {
    assertNotDemoMock.mockReturnValue(
      Response.json({ demo: true }) as unknown as ReturnType<typeof assertNotDemoMock>,
    );
    await post();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
