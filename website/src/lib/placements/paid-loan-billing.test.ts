import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  isFlagOnMock,
  subscriptionsCreateMock,
  subscriptionsUpdateMock,
  customersCreateMock,
  paymentMethodsListMock,
  setupIntentsCreateMock,
  scheduleTransferMock,
  platformFeePctMock,
  getAdminMock,
} = vi.hoisted(() => ({
  isFlagOnMock: vi.fn(),
  subscriptionsCreateMock: vi.fn(),
  subscriptionsUpdateMock: vi.fn(),
  customersCreateMock: vi.fn(),
  paymentMethodsListMock: vi.fn(),
  setupIntentsCreateMock: vi.fn(),
  scheduleTransferMock: vi.fn(),
  platformFeePctMock: vi.fn(),
  getAdminMock: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: customersCreateMock },
    paymentMethods: { list: paymentMethodsListMock },
    setupIntents: { create: setupIntentsCreateMock },
    subscriptions: { create: subscriptionsCreateMock, update: subscriptionsUpdateMock },
  },
}));
vi.mock("@/lib/stripe-connect", () => ({ scheduleTransfer: scheduleTransferMock }));
vi.mock("@/lib/platform-fee", () => ({
  platformFeePercentForArtist: platformFeePctMock,
  DEFAULT_PLAN_FEE_PERCENT: 10,
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: getAdminMock }));

import {
  startPaidLoanBilling,
  cancelPaidLoanBilling,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  recordPaidLoanSubscription,
} from "./paid-loan-billing";

beforeEach(() => {
  isFlagOnMock.mockReset();
  subscriptionsCreateMock.mockReset();
  subscriptionsUpdateMock.mockReset();
  customersCreateMock.mockReset();
  paymentMethodsListMock.mockReset();
  setupIntentsCreateMock.mockReset();
  scheduleTransferMock.mockReset();
  platformFeePctMock.mockReset();
  getAdminMock.mockReset();
  // The helper now hard-fails (returns "skipped") when this env is
  // unset, so the start-billing tests need a value to even reach the
  // Stripe.subscriptions.create path. Default to a stub product id;
  // individual tests can unset it to exercise the missing-env path.
  process.env.STRIPE_PAID_LOAN_PRODUCT_ID = "prod_test_stub";
});

// Build a chainable Supabase mock for the subset of methods this module
// touches: from(table).select().eq().maybeSingle() and from(...)
// .update().eq() and .upsert(). Returns a single object with hooks for
// the specific call patterns we care about.
function buildDb(opts: {
  billingForPlacement?: unknown;
  billingForSubscription?: unknown;
  venue?: unknown;
  artistConnect?: unknown;
  /** Existing-transfer row keyed by (order_id, recipient_user_id) for
   *  the idempotency pre-check in handleInvoicePaid. */
  existingTransfer?: unknown;
  /** placements row read by recordPaidLoanSubscription to decide newlyLinked. */
  placement?: unknown;
  /** Live (non-cancelled) billing rows for the cancel path's list lookup. */
  liveBillings?: unknown[];
} = {}): { db: object; updates: unknown[]; upserts: unknown[] } {
  const updates: unknown[] = [];
  const upserts: unknown[] = [];
  return {
    db: {
      from(table: string) {
        if (table === "placement_recurring_billings") {
          return {
            select: () => ({
              eq: (col: string, _val: string) => ({
                maybeSingle: async () =>
                  col === "placement_id"
                    ? { data: opts.billingForPlacement ?? null, error: null }
                    : { data: opts.billingForSubscription ?? null, error: null },
                // E7c: cancelPaidLoanBilling now filters cancelled rows out in SQL
                // and takes a list, because a cancelled row may legitimately sit
                // alongside a live one (migration 083) and maybeSingle would raise
                // PGRST116 on the pair.
                neq: () => ({
                  limit: async () => ({
                    data: opts.liveBillings ?? (opts.billingForPlacement ? [opts.billingForPlacement] : []),
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (row: unknown) => {
              upserts.push(row);
              return { data: null, error: null };
            },
            update: (row: unknown) => ({
              eq: async () => {
                updates.push({ table, row });
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === "stripe_transfers") {
          // Idempotency pre-check on handleInvoicePaid chains two
          // .eq() calls before .maybeSingle(). Return the configured
          // existingTransfer (or null) at the end of the chain.
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: opts.existingTransfer ?? null,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "placements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.placement ?? null, error: null }),
              }),
            }),
            update: (row: unknown) => ({
              eq: async () => {
                updates.push({ table, row });
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === "venue_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.venue ?? null, error: null }),
              }),
            }),
            update: (row: unknown) => ({
              eq: async () => {
                updates.push({ table, row });
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === "artist_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.artistConnect ?? null,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      },
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { email: "venue@example.com" } } }),
        },
      },
    },
    updates,
    upserts,
  };
}

describe("startPaidLoanBilling()", () => {
  it("short-circuits when PAID_LOAN_V2 flag is off", async () => {
    isFlagOnMock.mockReturnValue(false);
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "paid_loan",
        monthlyFeePence: 5000,
      },
      buildDb().db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "skipped" });
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });

  it("short-circuits for non-paid arrangement types", async () => {
    isFlagOnMock.mockReturnValue(true);
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "revenue_share",
        monthlyFeePence: 5000,
      },
      buildDb().db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res.status).toBe("skipped");
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });

  it("returns already_started when a billing row + Stripe sub already exist", async () => {
    isFlagOnMock.mockReturnValue(true);
    const { db } = buildDb({
      billingForPlacement: {
        id: "row1",
        stripe_subscription_id: "sub_111",
        status: "active",
      },
    });
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "paid_loan",
        monthlyFeePence: 5000,
      },
      db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "already_started", subscriptionId: "sub_111" });
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });

  it("mints a setup intent when the venue has no card on file", async () => {
    isFlagOnMock.mockReturnValue(true);
    paymentMethodsListMock.mockResolvedValue({ data: [] });
    setupIntentsCreateMock.mockResolvedValue({ client_secret: "seti_secret_123" });
    const { db } = buildDb({
      venue: {
        user_id: "v1",
        stripe_customer_id: "cus_existing",
        email: "v@e.com",
        name: "Venue",
      },
    });
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "paid_loan",
        monthlyFeePence: 5000,
      },
      db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res).toEqual({
      status: "missing_payment_method",
      customerId: "cus_existing",
      setupIntentClientSecret: "seti_secret_123",
    });
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });

  it("creates the Stripe customer with the venue's email column, not the auth fallback (row 19 #6)", async () => {
    isFlagOnMock.mockReturnValue(true);
    paymentMethodsListMock.mockResolvedValue({ data: [] });
    setupIntentsCreateMock.mockResolvedValue({ client_secret: "seti_secret_123" });
    customersCreateMock.mockResolvedValue({ id: "cus_new" });
    const { db } = buildDb({
      // No stripe_customer_id yet, so ensureVenueCustomer mints one; venue has an
      // email, which the phantom `contact_email` select used to miss.
      venue: { user_id: "v1", stripe_customer_id: null, email: "venue-real@e.com", name: "Venue" },
    });
    await startPaidLoanBilling(
      { placementId: "p1", venueUserId: "v1", artistUserId: "a1", arrangementType: "paid_loan", monthlyFeePence: 5000 },
      db as Parameters<typeof startPaidLoanBilling>[1],
    );
    // Fail-before: the old code read venue.contact_email (absent -> undefined) and
    // fell back to the auth email "venue@example.com" for the Stripe customer.
    expect(customersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "venue-real@e.com" }),
    );
  });

  it("returns skipped with a warning when STRIPE_PAID_LOAN_PRODUCT_ID is unset", async () => {
    isFlagOnMock.mockReturnValue(true);
    paymentMethodsListMock.mockResolvedValue({ data: [{ id: "pm_card" }] });
    delete process.env.STRIPE_PAID_LOAN_PRODUCT_ID;
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = buildDb({
      venue: {
        user_id: "v1",
        stripe_customer_id: "cus_existing",
        email: "v@e.com",
        name: "Venue",
      },
    });
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "paid_loan",
        monthlyFeePence: 5000,
      },
      db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res.status).toBe("skipped");
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("creates a Stripe subscription when card is on file and inserts the billing row", async () => {
    isFlagOnMock.mockReturnValue(true);
    paymentMethodsListMock.mockResolvedValue({ data: [{ id: "pm_card" }] });
    // SDK 22+ carries the period bounds on the first ITEM. The old fixture put
    // them on the subscription, where the code has never read them, so it proved
    // nothing about the dates.
    subscriptionsCreateMock.mockResolvedValue({
      id: "sub_new",
      items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 }] },
    });
    const { db, upserts, updates } = buildDb({
      venue: {
        user_id: "v1",
        stripe_customer_id: "cus_existing",
        email: "v@e.com",
        name: "Venue",
      },
      placement: { stripe_subscription_id: null },
    });
    const res = await startPaidLoanBilling(
      {
        placementId: "p1",
        venueUserId: "v1",
        artistUserId: "a1",
        arrangementType: "mixed",
        monthlyFeePence: 7500,
      },
      db as Parameters<typeof startPaidLoanBilling>[1],
    );
    expect(res.status).toBe("started");
    expect(res.subscriptionId).toBe("sub_new");
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { stripe_subscription_id: string }).stripe_subscription_id).toBe(
      "sub_new",
    );
    // Period bounds come off the item, so no row is stamped 1970 (E11b).
    expect((upserts[0] as { current_period_end: string }).current_period_end).toBe(
      new Date(1_702_000_000 * 1000).toISOString(),
    );
    // E7a: this path did not mirror onto placements either, so the setup route's
    // "already set up" guard stayed false for subscriptions started here too.
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "placements",
          row: expect.objectContaining({ stripe_subscription_id: "sub_new", subscription_status: "active" }),
        }),
      ]),
    );
  });
});

describe("cancelPaidLoanBilling()", () => {
  // This test used to assert `{ status: "skipped" }` with the flag off, i.e. it
  // pinned the defect E11 removes: refusing to cancel a subscription that already
  // exists, because the flag that would create new ones is off, leaves the venue
  // charged for a placement they have ended. Now it asserts the opposite.
  it("cancels even with PAID_LOAN_V2 off, because the subscription already exists (E11)", async () => {
    isFlagOnMock.mockReturnValue(false);
    subscriptionsUpdateMock.mockReset();
    subscriptionsUpdateMock.mockResolvedValue({});
    const { db } = buildDb({
      liveBillings: [{ id: "row1", stripe_subscription_id: "sub_live", status: "active" }],
    });
    const res = await cancelPaidLoanBilling(
      "p1",
      db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "cancelled" });
    expect(subscriptionsUpdateMock).toHaveBeenCalledWith("sub_live", {
      cancel_at_period_end: true,
    });
  });

  it("still reports not_found with the flag off when there is nothing to cancel", async () => {
    isFlagOnMock.mockReturnValue(false);
    subscriptionsUpdateMock.mockReset();
    const res = await cancelPaidLoanBilling(
      "p1",
      buildDb({ liveBillings: [] }).db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "not_found" });
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });

  it("calls subscription.update with cancel_at_period_end", async () => {
    isFlagOnMock.mockReturnValue(true);
    subscriptionsUpdateMock.mockResolvedValue({});
    const { db } = buildDb({
      billingForPlacement: {
        id: "row1",
        stripe_subscription_id: "sub_111",
        status: "active",
      },
    });
    const res = await cancelPaidLoanBilling(
      "p1",
      db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "cancelled" });
    expect(subscriptionsUpdateMock).toHaveBeenCalledWith("sub_111", {
      cancel_at_period_end: true,
    });
  });
});

describe("handleInvoicePaid()", () => {
  it("idempotently bumps period bounds + schedules artist payout", async () => {
    isFlagOnMock.mockReturnValue(true);
    // platformFeePercentForArtist is synchronous; the test mock must
    // mirror that, otherwise (1 - Promise/100) coerces to NaN and the
    // scheduleTransfer branch silently no-ops.
    platformFeePctMock.mockReturnValue(15);
    const { db, updates } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
        monthly_amount_pence: 10_000,
        current_period_end: null,
      },
      artistConnect: { stripe_connect_account_id: "acct_artist" },
    });
    const handled = await handleInvoicePaid(
      {
        id: "in_1",
        subscription: "sub_111",
        period_start: 1_700_000_000,
        period_end: 1_702_500_000,
        lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_500_000 } }] },
      } as unknown as Parameters<typeof handleInvoicePaid>[0],
      db as Parameters<typeof handleInvoicePaid>[1],
    );
    expect(handled).toBe(true);
    expect(updates).toHaveLength(1);
    expect(scheduleTransferMock).toHaveBeenCalledOnce();
    // 10_000 pence × (1 - 0.15) = 8500 pence
    expect(scheduleTransferMock.mock.calls[0][0].amountCents).toBe(8_500);
    expect(scheduleTransferMock.mock.calls[0][0].orderId).toBe("placement:p1:in_1");
  });

  it("returns false when no billing row matches", async () => {
    isFlagOnMock.mockReturnValue(true);
    const { db } = buildDb();
    const handled = await handleInvoicePaid(
      { id: "in_x", subscription: "sub_unknown" } as unknown as Parameters<typeof handleInvoicePaid>[0],
      db as Parameters<typeof handleInvoicePaid>[1],
    );
    expect(handled).toBe(false);
    expect(scheduleTransferMock).not.toHaveBeenCalled();
  });

  it("audit fix: skips scheduleTransfer on Stripe replay when transfer row already exists", async () => {
    isFlagOnMock.mockReturnValue(true);
    platformFeePctMock.mockReturnValue(15);
    const { db } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
        monthly_amount_pence: 10_000,
        current_period_end: null,
      },
      artistConnect: { stripe_connect_account_id: "acct_artist" },
      existingTransfer: { id: "tr_existing" },
    });
    const handled = await handleInvoicePaid(
      {
        id: "in_1",
        subscription: "sub_111",
        period_start: 1_700_000_000,
        period_end: 1_702_500_000,
        lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_500_000 } }] },
      } as unknown as Parameters<typeof handleInvoicePaid>[0],
      db as Parameters<typeof handleInvoicePaid>[1],
    );
    expect(handled).toBe(true);
    expect(scheduleTransferMock).not.toHaveBeenCalled();
  });
});

describe("handleInvoicePaymentFailed()", () => {
  it("marks past_due on a non-final attempt and paused on the final attempt", async () => {
    isFlagOnMock.mockReturnValue(true);

    const buildEvt = (final: boolean) => ({
      id: "in_failed",
      subscription: "sub_111",
      next_payment_attempt: final ? null : 1_700_999_999,
    });
    const { db: db1, updates: u1 } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
      },
    });
    await handleInvoicePaymentFailed(
      buildEvt(false) as unknown as Parameters<typeof handleInvoicePaymentFailed>[0],
      db1 as Parameters<typeof handleInvoicePaymentFailed>[1],
    );
    expect(u1[0]).toMatchObject({ row: { status: "past_due" } });

    const { db: db2, updates: u2 } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
      },
    });
    await handleInvoicePaymentFailed(
      buildEvt(true) as unknown as Parameters<typeof handleInvoicePaymentFailed>[0],
      db2 as Parameters<typeof handleInvoicePaymentFailed>[1],
    );
    expect(u2[0]).toMatchObject({ row: { status: "paused" } });
  });
});

describe("handleSubscriptionDeleted()", () => {
  it("marks the billing row cancelled", async () => {
    isFlagOnMock.mockReturnValue(true);
    const { db, updates } = buildDb({
      billingForSubscription: { id: "row1" },
    });
    const handled = await handleSubscriptionDeleted(
      { id: "sub_111" } as unknown as Parameters<typeof handleSubscriptionDeleted>[0],
      db as Parameters<typeof handleSubscriptionDeleted>[1],
    );
    expect(handled).toBe(true);
    expect(updates[0]).toMatchObject({ row: { status: "cancelled" } });
  });
});

// ── E7c: the cancel path and the upsert conflict target (04 §B6) ─────────────
//
// Two defects. The upsert's onConflict targeted stripe_subscription_id, a NULLABLE
// unique column, and NULLs do not conflict in Postgres, so nothing stopped one
// placement accumulating live billing rows. Migration 083 adds a partial unique
// index on placement_id WHERE status <> 'cancelled'. And cancelPaidLoanBilling read
// the row with .maybeSingle(), which raises PGRST116 the moment a cancelled row
// sits beside a live one, a state 083 deliberately permits so a venue can restart.
describe("cancelPaidLoanBilling() finds the live row (E7c)", () => {
  beforeEach(() => {
    isFlagOnMock.mockReturnValue(true);
    subscriptionsUpdateMock.mockReset();
    subscriptionsUpdateMock.mockResolvedValue({});
  });

  it("cancels the live subscription when a cancelled row sits beside it", async () => {
    // The exact pair that made maybeSingle raise PGRST116, return null, and leave
    // the venue being billed by a subscription this function reported as absent.
    const { db } = buildDb({
      liveBillings: [{ id: "b2", stripe_subscription_id: "sub_live", status: "active" }],
    });
    const res = await cancelPaidLoanBilling(
      "p1",
      db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "cancelled" });
    expect(subscriptionsUpdateMock).toHaveBeenCalledWith("sub_live", {
      cancel_at_period_end: true,
    });
  });

  it("reports not_found when every row for the placement is cancelled", async () => {
    const { db } = buildDb({ liveBillings: [] });
    const res = await cancelPaidLoanBilling(
      "p1",
      db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "not_found" });
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });

  it("ignores a live row that has no subscription id yet", async () => {
    const { db } = buildDb({
      liveBillings: [{ id: "b1", stripe_subscription_id: null, status: "active" }],
    });
    const res = await cancelPaidLoanBilling(
      "p1",
      db as Parameters<typeof cancelPaidLoanBilling>[1],
    );
    expect(res).toEqual({ status: "not_found" });
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });
});

describe("recordPaidLoanSubscription() handles the new unique index (E7c)", () => {
  beforeEach(() => {
    isFlagOnMock.mockReturnValue(true);
  });

  it("reports duplicate_live_billing on 23505 rather than a generic failure", async () => {
    // Migration 083 raises this when a placement already has a live row for a
    // DIFFERENT subscription. onConflict targets stripe_subscription_id, which
    // cannot resolve that, and a retry never will, so the caller must be able to
    // tell it apart from a transient error.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      from: (table: string) => {
        if (table === "placements") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {
          upsert: async () => ({
            error: { code: "23505", message: "duplicate key value", details: "sub_other" },
          }),
        };
      },
    };
    const res = await recordPaidLoanSubscription(
      {
        placementId: "p1",
        subscriptionId: "sub_new",
        customerId: "cus_1",
        payerUserId: "v1",
        payeeUserId: "a1",
        monthlyAmountPence: 4500,
        cpStart: null,
        cpEnd: null,
      },
      db as unknown as Parameters<typeof recordPaidLoanSubscription>[1],
    );
    expect(res).toMatchObject({ ok: false, error: "duplicate_live_billing" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses a zero monthly amount before touching the DB", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    let touched = false;
    const db = {
      from: () => {
        touched = true;
        return { upsert: async () => ({ error: null }) };
      },
    };
    const res = await recordPaidLoanSubscription(
      {
        placementId: "p1",
        subscriptionId: "sub_new",
        customerId: "cus_1",
        payerUserId: "v1",
        payeeUserId: "a1",
        monthlyAmountPence: 0,
        cpStart: null,
        cpEnd: null,
      },
      db as unknown as Parameters<typeof recordPaidLoanSubscription>[1],
    );
    expect(res).toMatchObject({ ok: false, error: "monthly_amount_missing" });
    expect(touched).toBe(false);
    warn.mockRestore();
  });
});

// ── E11: the flag gates creation, not reconciliation (04 §B6) ────────────────
//
// Every helper in this module short-circuited on PAID_LOAN_V2, which is off in
// prod. So a failed venue card did nothing at all: no past_due, no paused, no
// notification, and the placement kept displaying while nobody paid for it. A
// subscription that already exists in Stripe has to be reconciled whatever the flag
// says, because the flag only decides whether we would create a NEW one.
describe("webhook reconcilers ignore PAID_LOAN_V2 (E11)", () => {
  beforeEach(() => {
    isFlagOnMock.mockReturnValue(false); // prod's state
  });

  it("handleInvoicePaid reconciles with the flag off", async () => {
    const { db, updates } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
        monthly_amount_pence: 5000,
        current_period_end: null,
      },
      artistConnect: { stripe_connect_account_id: "acct_1", subscription_plan: "core", trial_end: null },
    });
    const handled = await handleInvoicePaid(
      {
        id: "in_1",
        subscription: "sub_1",
        period_start: 1_700_000_000,
        period_end: 1_702_000_000,
        lines: { data: [] },
      } as unknown as Parameters<typeof handleInvoicePaid>[0],
      db as Parameters<typeof handleInvoicePaid>[1],
    );
    expect(handled).toBe(true);
    // The period bounds were written, which is the reconciliation the flag blocked.
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "placement_recurring_billings",
          row: expect.objectContaining({ status: "active" }),
        }),
      ]),
    );
  });

  it("handleInvoicePaymentFailed marks past_due with the flag off", async () => {
    const { db, updates } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
        monthly_amount_pence: 5000,
        current_period_end: null,
      },
    });
    const handled = await handleInvoicePaymentFailed(
      {
        id: "in_2",
        subscription: "sub_1",
        next_payment_attempt: null, // final attempt
        lines: { data: [] },
      } as unknown as Parameters<typeof handleInvoicePaymentFailed>[0],
      db as Parameters<typeof handleInvoicePaymentFailed>[1],
    );
    expect(handled).toBe(true);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("handleSubscriptionDeleted marks cancelled with the flag off", async () => {
    const { db, updates } = buildDb({
      billingForSubscription: { id: "row1" },
    });
    const handled = await handleSubscriptionDeleted(
      { id: "sub_1" } as unknown as Parameters<typeof handleSubscriptionDeleted>[0],
      db as Parameters<typeof handleSubscriptionDeleted>[1],
    );
    expect(handled).toBe(true);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "placement_recurring_billings",
          row: expect.objectContaining({ status: "cancelled" }),
        }),
      ]),
    );
  });

  it("startPaidLoanBilling is STILL gated, because creation is what the flag is for", async () => {
    const res = await startPaidLoanBilling({
      placementId: "p1",
      venueUserId: "v1",
      artistUserId: "a1",
      arrangementType: "paid_loan",
      monthlyFeePence: 5000,
    }, buildDb().db as Parameters<typeof startPaidLoanBilling>[1]);
    expect(res).toEqual({ status: "skipped" });
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });
});
