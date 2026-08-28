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

const { sendAdminAlertMock } = vi.hoisted(() => ({
  sendAdminAlertMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      subject: string;
      fields?: { label: string; value: string }[];
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
}));

/** The single alert the call under test sent, or undefined if it sent none. */
function lastAlert() {
  return sendAdminAlertMock.mock.calls.at(-1)?.[0];
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
// K1: both were near-identical hand-written admin notifiers in the deleted
// @/lib/email. One helper now, so the two mocks collapse into one and the tests
// tell them apart by the alert's subject.
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

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

/** An invoice carrying a subscription id in the SDK-22 canonical shape. */
function invoice(
  subId: string | null,
  nextAttempt: number | null = 123,
  extra: { billingReason?: string; amountPaid?: number } = {},
): Stripe.Invoice {
  return {
    parent: subId ? { subscription_details: { subscription: subId } } : undefined,
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
