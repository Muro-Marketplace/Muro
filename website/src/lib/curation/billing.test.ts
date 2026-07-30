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

const { notifyAdminCurationCancelledMock } = vi.hoisted(() => ({
  notifyAdminCurationCancelledMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/email", () => ({
  notifyAdminCurationCancelled: notifyAdminCurationCancelledMock,
}));

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
function invoice(subId: string | null, nextAttempt: number | null = 123): Stripe.Invoice {
  return {
    parent: subId ? { subscription_details: { subscription: subId } } : undefined,
    next_payment_attempt: nextAttempt,
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
    expect(notifyAdminCurationCancelledMock).toHaveBeenCalledWith({
      requestId: "cr_1",
      venueName: "The Copper Kettle",
      tier: "managed_monthly",
    });
  });

  it("returns false and does not notify when the subscription is not a curation one", async () => {
    const { db, updates } = makeDb(null);

    const handled = await handleCurationSubscriptionDeleted(
      { id: "sub_other" } as Stripe.Subscription,
      db,
    );

    expect(handled).toBe(false);
    expect(updates).toHaveLength(0);
    expect(notifyAdminCurationCancelledMock).not.toHaveBeenCalled();
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
