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
vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: scheduleTransferMock,
  recordBlockedLeg: vi.fn(async () => {}),
}));
// WS4.6: the payout gate is real capability now, not a truthy account id.
vi.mock("@/lib/payouts/capability", () => ({
  canReceivePayout: vi.fn(async () => ({ ok: true, accountId: "acct_test" })),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/platform-fee", () => ({
  platformFeePercentForArtist: platformFeePctMock,
  DEFAULT_PLAN_FEE_PERCENT: 10,
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: getAdminMock }));

import {
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

  // Rows 2179-2187 / PASS2-offers-and-paid-loan-log. After the venue cancelled
  // placement p-1788192191293-7xdf, the page showed "Cancelled" at the top and,
  // further down, "Monthly payment active, £12.00/mo. Next payment on 30
  // September. Manage it any time from this page."
  //
  // Stripe HAD been told: `cancel_at_period_end: true` was sent, which is why
  // the row deliberately stays `active` (tearing it down early would cut short
  // a period the venue has paid for). But nothing recorded that a cancellation
  // was scheduled, so every reader saw a healthy subscription and
  // `current_period_end` was rendered as "next payment" when it is in fact the
  // last day of cover. Migration 127 adds the column; this writes it.
  it("records that a cancellation is scheduled, so readers stop calling it healthy", async () => {
    isFlagOnMock.mockReturnValue(true);
    subscriptionsUpdateMock.mockResolvedValue({});
    const { db, updates } = buildDb({
      liveBillings: [{ id: "row1", stripe_subscription_id: "sub_111", status: "active" }],
    });

    await cancelPaidLoanBilling("p1", db as Parameters<typeof cancelPaidLoanBilling>[1]);

    const flagged = (updates as Array<{ table: string; row: Record<string, unknown> }>).find(
      (u) => u.table === "placement_recurring_billings" && u.row.cancel_at_period_end === true,
    );
    expect(flagged, "nothing recorded that the subscription is winding down").toBeTruthy();
  });

  it("does not flag the row when Stripe refused the cancellation", async () => {
    // The flag is a claim about Stripe's state. Writing it after a failed call
    // would tell the venue they are not being charged when they still are.
    isFlagOnMock.mockReturnValue(true);
    subscriptionsUpdateMock.mockRejectedValue(new Error("stripe down"));
    const { db, updates } = buildDb({
      liveBillings: [{ id: "row1", stripe_subscription_id: "sub_111", status: "active" }],
    });

    await expect(
      cancelPaidLoanBilling("p1", db as Parameters<typeof cancelPaidLoanBilling>[1]),
    ).rejects.toThrow();
    expect(updates).toHaveLength(0);
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

  it("R2.13: an invoice for a NON-ACTIVE placement still pays but trips the admin alarm", async () => {
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
      placement: { status: "sold" },
    });
    const handled = await handleInvoicePaid(
      {
        id: "in_stale",
        subscription: "sub_111",
        period_start: 1_700_000_000,
        period_end: 1_702_500_000,
        lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_500_000 } }] },
      } as unknown as Parameters<typeof handleInvoicePaid>[0],
      db as Parameters<typeof handleInvoicePaid>[1],
    );
    expect(handled).toBe(true);
    const { sendAdminAlert } = await import("@/lib/email/admin-alert");
    const alerts = vi.mocked(sendAdminAlert).mock.calls
      .map((c) => c[0])
      .filter((c) => c.idempotencyKey === "paid_loan_nonactive:in_stale");
    expect(alerts).toHaveLength(1);
    // The venue WAS charged, so the artist share still schedules.
    expect(scheduleTransferMock).toHaveBeenCalled();
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

  // Email audit 2026-09-03 (6e). The start of a recurring card charge is
  // emailed to the venue and its failure is emailed to the venue, but the
  // charge ENDING was a bell and nothing else, as was the artist's monthly
  // payout ending with it. Both are money events.
  it("emails both the venue and the artist that the monthly billing has stopped", async () => {
    isFlagOnMock.mockReturnValue(true);
    const { sendEmail } = await import("@/lib/email/send");
    vi.mocked(sendEmail).mockClear();
    const { db } = buildDb({
      billingForSubscription: {
        id: "row1",
        placement_id: "p1",
        payer_user_id: "v1",
        payee_user_id: "a1",
      },
      placement: { work_title: "Mt. Fitz Roy", artist_slug: "fin-coles", monthly_fee_gbp: 45 },
    });

    await handleSubscriptionDeleted(
      { id: "sub_111" } as unknown as Parameters<typeof handleSubscriptionDeleted>[0],
      db as Parameters<typeof handleSubscriptionDeleted>[1],
    );

    const sends = vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
    const venue = sends.find((s) => s.template === "venue_paid_loan_billing_stopped");
    const artist = sends.find((s) => s.template === "artist_paid_loan_billing_stopped");
    expect(venue, "the venue was not told the charge had stopped").toBeTruthy();
    expect(artist, "the artist was not told their payouts had stopped").toBeTruthy();
    expect(venue!.subject).toContain("Mt. Fitz Roy");
    expect(artist!.subject).toContain("Mt. Fitz Roy");
    // Keyed per subscription per party, so a Stripe redelivery cannot double
    // either one, and the two do not dedupe against each other.
    expect(venue!.idempotencyKey).toBe("paid_loan_billing_stopped:sub_111:venue");
    expect(artist!.idempotencyKey).toBe("paid_loan_billing_stopped:sub_111:artist");
    // Never suppressible: the venue's card and the artist's income.
    expect(venue!.category).toBe("orders_and_payouts");
    expect(artist!.category).toBe("orders_and_payouts");
  });

  it("still marks the row cancelled when the emails throw", async () => {
    isFlagOnMock.mockReturnValue(true);
    const { sendEmail } = await import("@/lib/email/send");
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    const { db, updates } = buildDb({
      billingForSubscription: { id: "row1", placement_id: "p1", payer_user_id: "v1", payee_user_id: "a1" },
      placement: { work_title: "Mt. Fitz Roy", artist_slug: "fin-coles", monthly_fee_gbp: 45 },
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

  it("no longer exports a subscription creator at all (K2)", async () => {
    // startPaidLoanBilling was the second implementation that could start a
    // monthly charge for a placement. With PAID_LOAN_V2 on, an accepted
    // placement whose venue then clicked "Set up payment" would have produced
    // two live Stripe subscriptions billing the same venue twice.
    const mod = await import("./paid-loan-billing");
    expect(mod).not.toHaveProperty("startPaidLoanBilling");
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
  });
});
