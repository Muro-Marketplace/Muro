// E7b (04 §B6). Two defects in one route:
//
//   1. No Stripe idempotency key on session creation, so two clicks meant two
//      live subscriptions and two monthly charges for one placement.
//   2. The dedup guard read placements.stripe_subscription_id, which until E7a
//      was written by nothing, so it was permanently false.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionsCreateMock, fromMock, getUserMock, assertNotDemoMock, canAcceptMock } = vi.hoisted(
  () => ({
    sessionsCreateMock: vi.fn(async () => ({ id: "cs_1", url: "https://stripe.example/pay" })),
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
    assertNotDemoMock: vi.fn(() => null),
    canAcceptMock: vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })),
  }),
);

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock } } },
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getUserMock }));
vi.mock("@/lib/demo-guard", () => ({ assertNotDemo: assertNotDemoMock }));
vi.mock("@/lib/payouts/capability", () => ({ canReceivePayout: canAcceptMock }));

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
  artistProfile: Record<string, unknown> | null;
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
              data: state.artistProfile,
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
  state = {
    placement: { ...PLACEMENT },
    artistProfile: {
      name: "Maya",
      slug: "maya-chen",
      stripe_connect_account_id: "acct_1",
      subscription_plan: "core",
      trial_end: null,
    },
    billings: [],
    billingFilters: [],
  };
  fromMock.mockReset();
  sessionsCreateMock.mockClear();
  assertNotDemoMock.mockReturnValue(null);
  canAcceptMock.mockReset();
  canAcceptMock.mockResolvedValue({ ok: true });
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

// ── E8: gate on payout capability, and delete the destination charge ─────────
//
// The old gate was `artistProfile?.stripe_connect_account_id` being truthy, i.e.
// "the column is a non-empty string". It defaults to '' and is set the moment
// onboarding STARTS, so an account mid-KYC passed and the venue was charged
// monthly with no way to forward the money.
describe("POST /api/placements/[id]/payment/setup payout capability (E8)", () => {
  it("refuses with 422 and creates no session when the artist cannot be paid", async () => {
    canAcceptMock.mockResolvedValue({ ok: false, reason: "payouts_disabled" });
    const res = await post();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ reason: "payouts_unavailable" });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("checks capability by slug, not by a non-empty account id", async () => {
    await post();
    expect(canAcceptMock).toHaveBeenCalledWith(expect.anything(), {
      kind: "artist",
      slug: "maya-chen",
    });
  });

  it("refuses when the artist has an account id but is not charges_enabled", async () => {
    // The exact case the old check waved through: onboarding started, KYC not
    // finished, so charges_enabled is false while the column is non-empty.
    state.artistProfile = {
      name: "Maya",
      slug: "maya-chen",
      stripe_connect_account_id: "acct_started_kyc",
      subscription_plan: "core",
      trial_end: null,
    };
    canAcceptMock.mockResolvedValue({ ok: false, reason: "payouts_disabled" });
    expect((await post()).status).toBe(422);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses when the artist profile has no slug to check", async () => {
    state.artistProfile = null;
    expect((await post()).status).toBe(422);
    expect(canAcceptMock).not.toHaveBeenCalled();
  });

  it("says nothing about releasing a payment later, because nothing does that", async () => {
    canAcceptMock.mockResolvedValue({ ok: false, reason: "payouts_disabled" });
    const body = await (await post()).json();
    expect(body.error).not.toMatch(/releas/i);
    expect(body.error).toMatch(/can't start/i);
  });
});

// Defence in depth (owner decision 2026-08-28). The Zod schemas block new
// placements and counters from setting a fee between £0.01 and £14.99, but a
// legacy row written before the floor existed could still carry one; this
// guard stops that row from ever starting a subscription.
describe("POST /api/placements/[id]/payment/setup floor guard (owner decision 2026-08-28)", () => {
  it("422s a legacy placement with a fee below the £15 floor, and creates no session", async () => {
    state.placement = { ...PLACEMENT, monthly_fee_gbp: 10 };
    const res = await post();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ reason: "monthly_fee_below_floor" });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("proceeds when the fee is exactly the £15 floor", async () => {
    state.placement = { ...PLACEMENT, monthly_fee_gbp: 15 };
    expect((await post()).status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("still proceeds for fees comfortably above the floor (regression: PLACEMENT fixture is £45)", async () => {
    expect((await post()).status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/placements/[id]/payment/setup billing model (E8, §B6 decision)", () => {
  /** The subscription_data the session was created with. */
  function subscriptionData(): Record<string, unknown> {
    const [params] = sessionsCreateMock.mock.calls[0] as unknown as [
      { subscription_data: Record<string, unknown> },
    ];
    return params.subscription_data;
  }

  it("sends no transfer_data, so the platform collects and the ledger pays out", async () => {
    // A destination charge pays the artist directly and bypasses
    // stripe_transfers, leaving refunds, reversals and admin/financials blind.
    await post();
    expect(subscriptionData()).not.toHaveProperty("transfer_data");
  });

  it("sends no application_fee_percent", async () => {
    // The platform cut is taken from the transfer in handleInvoicePaid. Charging
    // it here as well would take it twice.
    await post();
    expect(subscriptionData()).not.toHaveProperty("application_fee_percent");
  });

  it("would otherwise double-pay: handleInvoicePaid already transfers the artist's share", async () => {
    // Since E7a records setup-route subscriptions in placement_recurring_billings,
    // handleInvoicePaid finds them and schedules a transfer. A destination charge
    // here would pay the artist through Stripe as well.
    await post();
    const data = subscriptionData();
    expect(Object.keys(data)).toEqual(["metadata"]);
  });

  it("still carries the metadata the webhook branch reads", async () => {
    await post();
    const [params] = sessionsCreateMock.mock.calls[0] as unknown as [
      { metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } },
    ];
    expect(params.metadata).toMatchObject({ kind: "paid_loan_monthly", placement_id: "pl-1" });
    expect(params.subscription_data.metadata).toMatchObject({
      kind: "paid_loan_monthly",
      placement_id: "pl-1",
      artist_user_id: "u-artist",
    });
  });
});
