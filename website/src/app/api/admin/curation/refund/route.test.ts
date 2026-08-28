// 04 D18 — the curation refund path. The route is the only control that moves
// money for curation (the status dropdown is bookkeeping), so the tests pin the
// money behaviour: full refund for one-off tiers, cancel-then-refund-last-invoice
// for managed tiers, an idempotency key scoped to the row, the type-confusion
// guard D18 was named for, and the order of operations (status only changes
// after Stripe succeeds).
//
// As in ../route.test.ts, the real withAdmin runs against a mocked Supabase, so
// the admin predicate is exercised rather than stubbed.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, updateMock, refundsCreate, subsCancel, invoicesList, sendEmailMock } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    fromMock: vi.fn(),
    recordMock: vi.fn(),
    updateMock: vi.fn(),
    refundsCreate: vi.fn(),
    subsCancel: vi.fn(),
    invoicesList: vi.fn(),
    sendEmailMock: vi.fn(),
  }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: { create: refundsCreate },
    subscriptions: { cancel: subsCancel },
    invoices: { list: invoicesList },
  },
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { POST } from "./route";

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

// One-off row: a real payment intent, no subscription.
const ONE_OFF_ROW = {
  id: REQUEST_ID,
  venue_name: "The Copper Kettle",
  contact_name: "Sam Park",
  contact_email: "sam@kettle.example",
  tier: "single_wall",
  status: "paid",
  amount_paid_gbp: 499,
  stripe_payment_intent_id: "pi_123",
  stripe_subscription_id: null,
  cancelled_at: null,
};

let rowForLookup: Record<string, unknown> | null = ONE_OFF_ROW;

function post(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/curation/refund", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();
  refundsCreate.mockReset();
  subsCancel.mockReset();
  invoicesList.mockReset();
  sendEmailMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});

  rowForLookup = { ...ONE_OFF_ROW };
  process.env.ADMIN_EMAILS = "boss@example.com";
  updateMock.mockReturnValue({ error: null });
  refundsCreate.mockResolvedValue({ id: "re_1", amount: 49900 });
  subsCancel.mockResolvedValue({ id: "sub_1", status: "canceled" });
  invoicesList.mockResolvedValue({ data: [] });
  sendEmailMock.mockResolvedValue(undefined);

  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rowForLookup, error: null }) }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => updateMock(payload),
      }),
    };
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: {} },
    },
    error: null,
  });
});

describe("authorisation and shape", () => {
  it("refuses a non-admin before touching Stripe", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u-x", email: "not-admin@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(403);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("400s a payload without a valid uuid", async () => {
    const res = await POST(post({ id: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("404s an unknown request", async () => {
    rowForLookup = null;
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(404);
  });

  it("409s a row already marked refunded, without calling Stripe again", async () => {
    rowForLookup = { ...ONE_OFF_ROW, status: "refunded" };
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(subsCancel).not.toHaveBeenCalled();
  });

  it("409s a row with no payment on record at all", async () => {
    rowForLookup = { ...ONE_OFF_ROW, stripe_payment_intent_id: null, stripe_subscription_id: null };
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});

describe("one-off tiers", () => {
  it("refunds the payment intent in full, keyed on the row, and marks the row refunded", async () => {
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(200);

    expect(refundsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = refundsCreate.mock.calls[0] as [
      { payment_intent: string; amount?: number },
      { idempotencyKey: string },
    ];
    expect(params.payment_intent).toBe("pi_123");
    // Full refund: no amount, Stripe refunds the lot.
    expect(params.amount).toBeUndefined();
    expect(opts.idempotencyKey).toBe(`curation_refund:${REQUEST_ID}`);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: "refunded" });

    const body = await res.json();
    expect(body.refunded).toBe(true);
    expect(body.refundedPence).toBe(49900);
  });

  it("emails the contact a refund receipt, keyed on the row", async () => {
    await POST(post({ id: REQUEST_ID }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      template: string;
      to: string;
      idempotencyKey: string;
    };
    expect(call.template).toBe("curation_refund_issued");
    expect(call.to).toBe("sam@kettle.example");
    expect(call.idempotencyKey).toBe(`curation_refund_issued:${REQUEST_ID}`);
  });

  it("a failed receipt email does not fail the refund", async () => {
    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(200);
  });

  it("records the admin action with the refund id", async () => {
    await POST(post({ id: REQUEST_ID }));
    expect(recordMock).toHaveBeenCalledTimes(1);
    const ctx = (recordMock.mock.calls[0] as unknown[]).find(
      (a) => typeof a === "object" && a !== null && "context" in (a as Record<string, unknown>),
    ) as { context?: Record<string, unknown> } | undefined;
    // recordAdminAction signatures vary; assert on whichever argument carries it.
    const flat = JSON.stringify(recordMock.mock.calls[0]);
    expect(flat).toContain("re_1");
    expect(flat).toContain(REQUEST_ID);
    void ctx;
  });

  it("D18's guard: refuses a payment-intent column holding a subscription id", async () => {
    rowForLookup = { ...ONE_OFF_ROW, stripe_payment_intent_id: "sub_999" };
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("a Stripe refusal leaves the row untouched (502, no status write)", async () => {
    refundsCreate.mockRejectedValue(new Error("insufficient balance"));
    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(502);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("managed tiers", () => {
  const MANAGED_ROW = {
    ...ONE_OFF_ROW,
    tier: "managed_monthly",
    stripe_payment_intent_id: null,
    stripe_subscription_id: "sub_42",
  };

  it("cancels the subscription, then refunds the latest paid invoice", async () => {
    rowForLookup = { ...MANAGED_ROW };
    invoicesList.mockResolvedValue({ data: [{ id: "in_1", payment_intent: "pi_from_invoice" }] });

    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(200);

    expect(subsCancel).toHaveBeenCalledWith("sub_42");
    expect(invoicesList).toHaveBeenCalledWith({ subscription: "sub_42", status: "paid", limit: 1 });
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect((refundsCreate.mock.calls[0] as [{ payment_intent: string }])[0].payment_intent).toBe(
      "pi_from_invoice",
    );
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: "refunded" });
    // Billing stopped: cancelled_at is stamped alongside.
    expect(updateMock.mock.calls[0][0]).toHaveProperty("cancelled_at");
  });

  it("with no paid invoice: cancels, refunds nothing, marks cancelled and says so", async () => {
    rowForLookup = { ...MANAGED_ROW };
    invoicesList.mockResolvedValue({ data: [] });

    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(200);

    expect(subsCancel).toHaveBeenCalledWith("sub_42");
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: "cancelled" });

    const body = await res.json();
    expect(body.refunded).toBe(false);
    // No money moved, so no "refund issued" receipt.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("an already-cancelled subscription is not an error: continue to the refund", async () => {
    rowForLookup = { ...MANAGED_ROW };
    subsCancel.mockRejectedValue(new Error("This subscription is a canceled subscription."));
    invoicesList.mockResolvedValue({ data: [{ id: "in_1", payment_intent: "pi_from_invoice" }] });

    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it("cancel succeeded but refund failed: 502 telling the admin billing is stopped", async () => {
    rowForLookup = { ...MANAGED_ROW };
    invoicesList.mockResolvedValue({ data: [{ id: "in_1", payment_intent: "pi_from_invoice" }] });
    refundsCreate.mockRejectedValue(new Error("card_declined"));

    const res = await POST(post({ id: REQUEST_ID }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled but the refund failed/);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
