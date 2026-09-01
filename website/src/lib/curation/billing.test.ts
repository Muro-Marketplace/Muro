// D21. The managed-curation subscription reconcilers.
//
// Before this, a renewal / cancellation / failed payment on a managed curation
// subscription updated nothing, so curation_requests.status was frozen at
// 'in_progress' forever. These tests pin the three handlers: each finds its row
// by stripe_subscription_id, writes the right state, and returns false (so the
// webhook router falls through) when the subscription is not a curation one.

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

const { sendAdminAlertMock, sendEmailMock, accrueProgrammeRentMock } = vi.hoisted(() => ({
  sendAdminAlertMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      subject: string;
      fields?: { label: string; value: string }[];
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
  // Review fix: handleCurationInvoicePaid now also sends the programme
  // client's own payment confirmation via sendEmail directly (not through
  // sendAdminAlert), so it needs its own mock -- without one, the real
  // sendEmail would run against the {} supabase-admin stub below, throw, and
  // be silently swallowed by the handler's own try/catch, leaving the send
  // untested.
  sendEmailMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      template: string;
      to: string;
      subject: string;
      react: unknown;
      metadata?: Record<string, unknown>;
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
  // Task 6: programme-rent.ts has its own dedicated unit tests
  // (programme-rent.test.ts). Here we only pin the WIRING -- that
  // handleCurationInvoicePaid calls it with the right arguments, only for a
  // programme row, and that a throw from it cannot break reconciliation --
  // so a plain mock stands in rather than a real fake DB.
  accrueProgrammeRentMock: vi.fn(async (_db: unknown, _input: unknown) => ({
    accrued: 0,
    skipped: 0,
    failed: 0,
  })),
}));

/** The single alert the call under test sent, or undefined if it sent none. */
function lastAlert() {
  return sendAdminAlertMock.mock.calls.at(-1)?.[0];
}

/** The single email the call under test sent, or undefined if it sent none. */
function lastEmail() {
  return sendEmailMock.mock.calls.at(-1)?.[0];
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
// K1: both were near-identical hand-written admin notifiers in the deleted
// @/lib/email. One helper now, so the two mocks collapse into one and the tests
// tell them apart by the alert's subject.
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/curation/programme-rent", () => ({ accrueProgrammeRent: accrueProgrammeRentMock }));

import {
  handleCurationInvoicePaid,
  handleCurationInvoiceFailed,
  handleCurationSubscriptionDeleted,
} from "./billing";

const ROW = {
  id: "cr_1",
  status: "in_progress",
  contact_email: "maya@example.com",
  contact_name: "Maya Chen",
  venue_name: "The Copper Kettle",
  tier: "managed_monthly",
};

// Task 5: a Wallplace Programme row, the shape found only via metadata (see
// makeDbByColumn below) because its checkout session never populates
// stripe_subscription_id -- T4's programme checkout
// (src/app/api/curation/[id]/checkout/route.ts) carries session metadata
// `{ curation_request_id, tier: "programme" }` with no `kind` field, so the
// webhook's `session.metadata?.kind === "curation_request"` branch
// (src/app/api/webhooks/stripe/route.ts) never matches it.
const PROGRAMME_ROW = {
  id: "cr_prog_1",
  status: "pending_payment",
  contact_email: "sam@example.com",
  contact_name: "Sam Okafor",
  venue_name: "Riverside Offices",
  tier: "programme",
  // Review fix: the fields Task 4's admin quote route writes (PROGRAMME_LADDER's
  // 10-piece rung), needed now that the first-payment admin alert and customer
  // receipt read them off the row.
  quoted_amount_gbp: 250,
  billing_interval: "month" as const,
  pieces_estimate: 10,
  rotation_cadence: "quarterly",
  term_months: 12,
};

/** A curation_requests-only fake that records every update payload. */
function makeDb(row: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  let lookupSub: string | null = null;
  const db = {
    from(table: string) {
      if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, val: string) => {
            lookupSub = val;
            return { maybeSingle: async () => ({ data: row, error: null }) };
          },
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, updates, sub: () => lookupSub };
}

/**
 * Task 5: a curation_requests fake that answers differently depending on
 * which column is filtered, so a test can pin down exactly which lookup
 * resolved the row -- makeDb above always returns the same row (or null) for
 * any column, which cannot distinguish "found by stripe_subscription_id"
 * from "found by id" (the curation_request_id fallback). Also records the
 * row id the eventual .update(...).eq("id", …) targets, so a test can prove
 * the RIGHT row was written when two different rows could each answer a
 * different lookup.
 */
function makeDbByColumn(byColumn: {
  stripe_subscription_id?: Record<string, unknown> | null;
  id?: Record<string, unknown> | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const updateTargets: string[] = [];
  const lookups: Array<{ col: string; val: string }> = [];
  const db = {
    from(table: string) {
      if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            lookups.push({ col, val });
            const data = (byColumn as Record<string, Record<string, unknown> | null | undefined>)[col] ?? null;
            return { maybeSingle: async () => ({ data, error: null }) };
          },
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: async (_col: string, val: string) => {
              updateTargets.push(val);
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, updates, updateTargets, lookups };
}

/**
 * Finding 1 (review fix): like makeDbByColumn, but each column can also carry
 * its own PostgREST-shaped error -- makeDbByColumn above always answers
 * `{ error: null }`, which cannot express "this lookup's own query failed"
 * (e.g. a phantom column, see tests/integration/phantom-columns.test.ts)
 * distinctly from "this lookup legitimately found no row". Used to pin
 * findBySubscription's and findByRequestId's error handling independently.
 */
function makeDbWithColumnResults(
  byColumn: Record<
    string,
    { data: Record<string, unknown> | null; error: { message: string } | null }
  >,
) {
  const db = {
    from(table: string) {
      if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string) => ({
            maybeSingle: async () => byColumn[col] ?? { data: null, error: null },
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  } as unknown as SupabaseClient;
  return db;
}

/**
 * An invoice carrying a subscription id in the SDK-22 canonical shape, and
 * optionally the curation_request_id Stripe snapshots onto
 * parent.subscription_details.metadata from the subscription's own metadata
 * (Task 5: T4's checkout writes that via subscription_data.metadata).
 */
function invoice(
  subId: string | null,
  nextAttempt: number | null = 123,
  extra: { billingReason?: string; amountPaid?: number; curationRequestId?: string; id?: string } = {},
): Stripe.Invoice {
  const subscriptionDetails =
    subId || extra.curationRequestId
      ? {
          subscription: subId ?? undefined,
          ...(extra.curationRequestId
            ? { metadata: { curation_request_id: extra.curationRequestId } }
            : {}),
        }
      : undefined;
  return {
    // Task 6: real Stripe.Invoice.id is a required string; defaulted here
    // (rather than left unset, as before) so accrueProgrammeRent's
    // invoiceId argument is always a realistic value, not undefined.
    id: extra.id ?? "in_test",
    parent: subscriptionDetails ? { subscription_details: subscriptionDetails } : undefined,
    next_payment_attempt: nextAttempt,
    billing_reason: extra.billingReason,
    amount_paid: extra.amountPaid,
  } as unknown as Stripe.Invoice;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCurationInvoicePaid", () => {
  it("keeps a curation subscription in_progress and stamps last_invoice_paid_at", async () => {
    const { db, updates, sub } = makeDb(ROW);

    const handled = await handleCurationInvoicePaid(invoice("sub_cur_1"), db);

    expect(handled).toBe(true);
    expect(sub()).toBe("sub_cur_1");
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("in_progress");
    expect(updates[0].last_invoice_paid_at).toEqual(expect.any(String));
  });

  it("returns false and writes nothing when no curation row matches", async () => {
    const { db, updates } = makeDb(null);

    const handled = await handleCurationInvoicePaid(invoice("sub_other"), db);

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("returns false when the invoice carries no subscription id", async () => {
    const { db, updates } = makeDb(ROW);

    const handled = await handleCurationInvoicePaid(invoice(null), db);

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("D23: pings the admin on a subscription_cycle renewal", async () => {
    const { db } = makeDb(ROW);

    await handleCurationInvoicePaid(
      invoice("sub_cur_1", null, { billingReason: "subscription_cycle", amountPaid: 7999 }),
      db,
    );

    // K1: one generic alert helper now, so the identifying detail lives in the
    // subject and fields rather than in named props.
    const alert = lastAlert();
    expect(alert?.subject).toContain("Curation renewal paid");
    expect(alert?.subject).toContain("79.99");
    const values = (alert?.fields ?? []).map((f) => f.value).join(" | ");
    expect(values).toContain("Managed subscription renewal");
  });

  it("review fix: the renewal alert's Kind field reflects a programme row instead of the hardcoded managed-tier literal", async () => {
    const { db } = makeDb(PROGRAMME_ROW);

    await handleCurationInvoicePaid(
      invoice("sub_prog_1", null, { billingReason: "subscription_cycle", amountPaid: 25000 }),
      db,
    );

    const alert = lastAlert();
    const values = (alert?.fields ?? []).map((f) => f.value).join(" | ");
    expect(values).toContain("Programme renewal");
    expect(values).not.toContain("Managed subscription renewal");
  });

  it("D23: does NOT ping the admin on the first invoice (subscription_create)", async () => {
    const { db, updates } = makeDb(ROW);

    const handled = await handleCurationInvoicePaid(
      invoice("sub_cur_1", null, { billingReason: "subscription_create", amountPaid: 7999 }),
      db,
    );

    // Still reconciles the row, just no admin ping (the checkout webhook already sent one).
    expect(handled).toBe(true);
    expect(updates[0].status).toBe("in_progress");
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});

// Finding 1 (review fix): findBySubscription and findByRequestId used to
// destructure only `{ data }` and never look at `{ error }`, so a query that
// PostgREST rejected wholesale (e.g. a select naming a column the live schema
// lacks -- see tests/integration/phantom-columns.test.ts) was indistinguishable
// from a legitimate "no such row": both fell through the `?? null` and came
// back as a quiet `false` from the handler, with nothing logged. These pin
// that a query error is now logged loudly (so a real outage is diagnosable)
// while a genuine no-row match stays exactly as quiet as before.
describe("findBySubscription / findByRequestId — review fix: query errors are surfaced, not swallowed", () => {
  it("findBySubscription logs the error and resolves null when its own select errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeDbWithColumnResults({
      stripe_subscription_id: {
        data: null,
        error: { message: "column curation_requests.quoted_amount_gbp does not exist" },
      },
    });

    const handled = await handleCurationInvoicePaid(invoice("sub_broken_select"), db);

    expect(handled).toBe(false);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      "[curation billing] findBySubscription query failed",
      expect.objectContaining({
        subId: "sub_broken_select",
        error: "column curation_requests.quoted_amount_gbp does not exist",
      }),
    );
    errSpy.mockRestore();
  });

  it("findBySubscription stays quiet and resolves null when the query legitimately finds no row", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeDbWithColumnResults({
      stripe_subscription_id: { data: null, error: null },
    });

    const handled = await handleCurationInvoicePaid(invoice("sub_no_such_row"), db);

    expect(handled).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("findByRequestId logs the error and resolves null when its own select errors, after a clean subscription-id miss", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeDbWithColumnResults({
      stripe_subscription_id: { data: null, error: null },
      id: {
        data: null,
        error: { message: "column curation_requests.term_months does not exist" },
      },
    });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_1", null, { curationRequestId: "cr_broken_select" }),
      db,
    );

    expect(handled).toBe(false);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      "[curation billing] findByRequestId query failed",
      expect.objectContaining({
        curationRequestId: "cr_broken_select",
        error: "column curation_requests.term_months does not exist",
      }),
    );
    errSpy.mockRestore();
  });

  it("findByRequestId stays quiet and resolves null when the query legitimately finds no row", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeDbWithColumnResults({
      stripe_subscription_id: { data: null, error: null },
      id: { data: null, error: null },
    });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_2", null, { curationRequestId: "cr_no_such_row" }),
      db,
    );

    expect(handled).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// Task 5: Wallplace Programmes ride these same reconcilers. Its checkout
// session carries no `kind: "curation_request"` (see PROGRAMME_ROW's
// comment above), so stripe_subscription_id is never populated the way a
// managed tier's was; curation_request_id metadata is the only way a
// programme's row is ever found.
describe("handleCurationInvoicePaid — Task 5 programme metadata resolution", () => {
  it("resolves a programme row via curation_request_id when stripe_subscription_id is not yet linked, and backfills it", async () => {
    const { db, updates, updateTargets, lookups } = makeDbByColumn({
      stripe_subscription_id: null,
      id: PROGRAMME_ROW,
    });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_prog_1", null, {
        curationRequestId: "cr_prog_1",
        billingReason: "subscription_create",
        amountPaid: 25000,
      }),
      db,
    );

    expect(handled).toBe(true);
    expect(lookups).toEqual([
      { col: "stripe_subscription_id", val: "sub_prog_1" },
      { col: "id", val: "cr_prog_1" },
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("in_progress");
    expect(updates[0].last_invoice_paid_at).toEqual(expect.any(String));
    // The subscription id is backfilled so a later renewal, failure or
    // cancellation can resolve the fast way, matching what the checkout
    // webhook writes for a managed tier at signup (D20, migration 099).
    expect(updates[0].stripe_subscription_id).toBe("sub_prog_1");
    expect(updateTargets).toEqual(["cr_prog_1"]);
    // Review fix: this used to assert sendAdminAlertMock was NOT called here,
    // pinning the exact gap the review flagged as if it were intended
    // behaviour. Unlike a managed tier, a programme's checkout session never
    // runs the webhook's curation branch (see billing.ts's header comment),
    // so this reconciler is the ONLY place anyone is ever told the client
    // paid -- both sends below now fire on exactly this event.
    const alert = lastAlert();
    expect(alert?.subject).toContain("Programme confirmed");
    expect(alert?.subject).toContain("250.00");
    const alertValues = (alert?.fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(alertValues).toContain("Venue: Riverside Offices");
    expect(alertValues).toContain("Quote: £250.00 per month");
    expect(alertValues).toContain("Pieces: 10");
    expect(alertValues).toContain("Rotation: quarterly");
    expect(alertValues).toContain("Request: cr_prog_1");

    // Finding 2: the client gets their own confirmation on the same event,
    // via the same sendEmail mechanism the other curation lifecycle emails use.
    const email = lastEmail();
    expect(email?.template).toBe("curation_programme_confirmed");
    expect(email?.to).toBe("sam@example.com");
    expect(email?.idempotencyKey).toBe("curation_programme_confirmed:cr_prog_1");
  });

  it("review fix: alerts the admin but skips the client email when the programme row has no contact email", async () => {
    const rowWithoutEmail = { ...PROGRAMME_ROW, contact_email: null };
    const { db } = makeDbByColumn({ stripe_subscription_id: null, id: rowWithoutEmail });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_prog_9", null, {
        curationRequestId: "cr_prog_1",
        billingReason: "subscription_create",
        amountPaid: 25000,
      }),
      db,
    );

    expect(handled).toBe(true);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("prefers the stripe_subscription_id match over metadata when both could resolve a row", async () => {
    const bySubRow = { ...ROW, id: "cr_legacy_sub_match" };
    const byIdRow = { ...PROGRAMME_ROW, id: "cr_should_not_be_touched" };
    const { db, updates, updateTargets, lookups } = makeDbByColumn({
      stripe_subscription_id: bySubRow,
      id: byIdRow,
    });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_x", null, { curationRequestId: "cr_should_not_be_touched" }),
      db,
    );

    expect(handled).toBe(true);
    // Only the subscription-id lookup ran: metadata is a fallback for when
    // that misses, not a second source of truth once it has already found
    // the row. This is the "extend, don't replace" guarantee for every
    // existing managed-tier row, which always resolves this way.
    expect(lookups).toEqual([{ col: "stripe_subscription_id", val: "sub_x" }]);
    expect(updates).toHaveLength(1);
    expect(updateTargets).toEqual(["cr_legacy_sub_match"]);
  });

  it("ignores an invoice whose metadata names no known curation request, without throwing", async () => {
    const { db, updates } = makeDbByColumn({ stripe_subscription_id: null, id: null });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_orphan", null, { curationRequestId: "cr_does_not_exist" }),
      db,
    );

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

// Task 6: accrueProgrammeRent itself is covered by programme-rent.test.ts
// (a real fake DB, the pool guard, the unique-constraint replay). These
// tests pin only the WIRING in this file: called with the right arguments,
// only for a programme row, on every paid invoice regardless of
// billing_reason, and unable to break reconciliation or the notifications
// that run after it in the same function.
describe("handleCurationInvoicePaid — Task 6 programme rent accrual wiring", () => {
  it("calls accrueProgrammeRent for a monthly programme row with periodMonths 1", async () => {
    const { db } = makeDb(PROGRAMME_ROW); // billing_interval: "month", quoted_amount_gbp: 250

    await handleCurationInvoicePaid(invoice("sub_prog_1", null, { id: "in_month_1" }), db);

    expect(accrueProgrammeRentMock).toHaveBeenCalledTimes(1);
    expect(accrueProgrammeRentMock).toHaveBeenCalledWith(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_month_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });
  });

  it("derives periodMonths 3 for a quarterly-billed programme row", async () => {
    const quarterlyRow = { ...PROGRAMME_ROW, billing_interval: "quarter" as const };
    const { db } = makeDb(quarterlyRow);

    await handleCurationInvoicePaid(invoice("sub_prog_2", null, { id: "in_q_1" }), db);

    expect(accrueProgrammeRentMock).toHaveBeenCalledWith(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_q_1",
      periodMonths: 3,
      quotedAmountPence: 25000,
    });
  });

  it("does not call accrueProgrammeRent for a non-programme (managed) row", async () => {
    const { db } = makeDb(ROW); // tier: "managed_monthly"

    const handled = await handleCurationInvoicePaid(invoice("sub_cur_1"), db);

    expect(handled).toBe(true);
    expect(accrueProgrammeRentMock).not.toHaveBeenCalled();
  });

  it("accrues on a renewal too, not just the first invoice", async () => {
    const { db } = makeDb(PROGRAMME_ROW);

    await handleCurationInvoicePaid(
      invoice("sub_prog_3", null, {
        billingReason: "subscription_cycle",
        amountPaid: 25000,
        id: "in_renewal",
      }),
      db,
    );

    expect(accrueProgrammeRentMock).toHaveBeenCalledTimes(1);
    expect(accrueProgrammeRentMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ invoiceId: "in_renewal" }),
    );
  });

  it("an accrual failure does not break reconciliation or the renewal alert that runs after it", async () => {
    accrueProgrammeRentMock.mockRejectedValueOnce(new Error("accrual boom"));
    const { db, updates } = makeDb(PROGRAMME_ROW);

    const handled = await handleCurationInvoicePaid(
      invoice("sub_prog_4", null, {
        billingReason: "subscription_cycle",
        amountPaid: 25000,
        id: "in_boom",
      }),
      db,
    );

    // The status reconcile (which runs BEFORE the accrual call) still landed.
    expect(handled).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("in_progress");
    // The renewal alert (which runs AFTER the accrual call in the same
    // function body) still fired -- proving the throw was caught locally
    // rather than aborting the rest of handleCurationInvoicePaid.
    const alert = lastAlert();
    expect(alert?.subject).toContain("Curation renewal paid");
  });

  it("an accrual failure does not suppress the programme first-payment alert and client receipt", async () => {
    accrueProgrammeRentMock.mockRejectedValueOnce(new Error("accrual boom"));
    const { db } = makeDbByColumn({ stripe_subscription_id: null, id: PROGRAMME_ROW });

    const handled = await handleCurationInvoicePaid(
      invoice("sub_prog_5", null, {
        curationRequestId: "cr_prog_1",
        billingReason: "subscription_create",
        amountPaid: 25000,
        id: "in_boom_first",
      }),
      db,
    );

    expect(handled).toBe(true);
    const alert = lastAlert();
    expect(alert?.subject).toContain("Programme confirmed");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleCurationSubscriptionDeleted", () => {
  it("marks the row cancelled, stamps cancelled_at and alerts the admin", async () => {
    const { db, updates } = makeDb(ROW);

    const handled = await handleCurationSubscriptionDeleted(
      { id: "sub_cur_1" } as Stripe.Subscription,
      db,
    );

    expect(handled).toBe(true);
    expect(updates[0].status).toBe("cancelled");
    expect(updates[0].cancelled_at).toEqual(expect.any(String));
    const alert = lastAlert();
    expect(alert?.subject).toContain("Curation subscription cancelled");
    const values = (alert?.fields ?? []).map((f) => f.value).join(" | ");
    expect(values).toContain("cr_1");
    expect(values).toContain("The Copper Kettle");
    expect(values).toContain("managed_monthly");
  });

  it("returns false and does not notify when the subscription is not a curation one", async () => {
    const { db, updates } = makeDb(null);

    const handled = await handleCurationSubscriptionDeleted(
      { id: "sub_other" } as Stripe.Subscription,
      db,
    );

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});

describe("handleCurationSubscriptionDeleted — Task 5 programme metadata resolution", () => {
  it("resolves via subscription.metadata.curation_request_id, persists stripe_subscription_id and alerts", async () => {
    const { db, updates, updateTargets, lookups } = makeDbByColumn({
      stripe_subscription_id: null,
      id: PROGRAMME_ROW,
    });

    const handled = await handleCurationSubscriptionDeleted(
      {
        id: "sub_prog_2",
        metadata: { curation_request_id: "cr_prog_1", tier: "programme" },
      } as unknown as Stripe.Subscription,
      db,
    );

    expect(handled).toBe(true);
    expect(lookups).toEqual([
      { col: "stripe_subscription_id", val: "sub_prog_2" },
      { col: "id", val: "cr_prog_1" },
    ]);
    expect(updates[0].status).toBe("cancelled");
    expect(updates[0].cancelled_at).toEqual(expect.any(String));
    expect(updates[0].stripe_subscription_id).toBe("sub_prog_2");
    expect(updateTargets).toEqual(["cr_prog_1"]);
    const alert = lastAlert();
    expect(alert?.subject).toContain("Curation subscription cancelled");
    const values = (alert?.fields ?? []).map((f) => f.value).join(" | ");
    expect(values).toContain("Riverside Offices");
  });

  // Finding 3: both invoice handlers' own "Task 5 programme metadata
  // resolution" blocks have this counterpart (see "ignores an invoice whose
  // metadata names no known curation request, without throwing" above); this
  // one was missing it.
  it("resolves neither subscription id nor metadata, ignored gracefully", async () => {
    const { db, updates } = makeDbByColumn({ stripe_subscription_id: null, id: null });

    const handled = await handleCurationSubscriptionDeleted(
      {
        id: "sub_orphan",
        metadata: { curation_request_id: "cr_does_not_exist" },
      } as unknown as Stripe.Subscription,
      db,
    );

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});

describe("handleCurationInvoiceFailed", () => {
  it("sets past_due while Stripe still has retries left", async () => {
    const { db, updates } = makeDb(ROW);

    const handled = await handleCurationInvoiceFailed(invoice("sub_cur_1", 1_700_000_000), db);

    expect(handled).toBe(true);
    expect(updates[0].status).toBe("past_due");
  });

  it("sets paused once Stripe has exhausted its retries", async () => {
    const { db, updates } = makeDb(ROW);

    const handled = await handleCurationInvoiceFailed(invoice("sub_cur_1", null), db);

    expect(handled).toBe(true);
    expect(updates[0].status).toBe("paused");
  });

  it("returns false when no curation row matches", async () => {
    const { db, updates } = makeDb(null);

    const handled = await handleCurationInvoiceFailed(invoice("sub_other", null), db);

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe("handleCurationInvoiceFailed — Task 5 programme metadata resolution", () => {
  it("resolves via metadata and marks past_due while retries remain, backfilling stripe_subscription_id", async () => {
    const { db, updates } = makeDbByColumn({ stripe_subscription_id: null, id: PROGRAMME_ROW });

    const handled = await handleCurationInvoiceFailed(
      invoice("sub_prog_3", 1_700_000_000, { curationRequestId: "cr_prog_1" }),
      db,
    );

    expect(handled).toBe(true);
    expect(updates[0].status).toBe("past_due");
    expect(updates[0].stripe_subscription_id).toBe("sub_prog_3");
  });

  it("resolves via metadata and marks paused once retries are exhausted", async () => {
    const { db, updates } = makeDbByColumn({ stripe_subscription_id: null, id: PROGRAMME_ROW });

    const handled = await handleCurationInvoiceFailed(
      invoice("sub_prog_3", null, { curationRequestId: "cr_prog_1" }),
      db,
    );

    expect(handled).toBe(true);
    expect(updates[0].status).toBe("paused");
  });

  it("ignores an invoice whose metadata names no known curation request, without throwing", async () => {
    const { db, updates } = makeDbByColumn({ stripe_subscription_id: null, id: null });

    const handled = await handleCurationInvoiceFailed(
      invoice("sub_orphan", null, { curationRequestId: "cr_does_not_exist" }),
      db,
    );

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
