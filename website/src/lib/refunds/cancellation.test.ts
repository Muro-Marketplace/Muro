// The cancellation refund's failure modes. The happy path is covered through
// the orders route; these pin what happens when a DB write fails AFTER the
// money has already moved in Stripe, which no code path can undo.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, refundsCreate, reversalCreate, sendAdminAlertMock, sendEmailMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  refundsCreate: vi.fn(),
  reversalCreate: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const })),
  sendEmailMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { refunds: { create: refundsCreate }, transfers: { createReversal: reversalCreate } },
}));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/templates/orders/CustomerRefundConfirmation", () => ({
  CustomerRefundConfirmation: () => null,
}));

import { processCancellationRefund } from "./cancellation";

const ORDER = {
  id: "o1",
  buyer_email: "b@x.com",
  stripe_payment_intent_id: "pi_1",
  items: [{ workId: "w-1", quantity: 1 }],
};

/** Every UPDATE payload written this test, with its table. */
let writes: Array<{ table: string; row: Record<string, unknown> }> = [];

/** `failWrite` names the table whose UPDATE reports an error. */
function setupDb(opts: { paidLegs?: Array<{ id: string; stripe_transfer_id: string }>; failWrite?: string } = {}) {
  const { paidLegs = [], failWrite } = opts;
  writes = [];
  fromMock.mockImplementation((table: string) => ({
    select: () => ({
      eq: (..._a: unknown[]) => ({
        single: async () => ({ data: ORDER, error: null }),
        eq: async () => ({ data: paidLegs, error: null }),
      }),
    }),
    update: (row: Record<string, unknown>) => ({
      eq: async () => {
        writes.push({ table, row });
        return { error: table === failWrite ? { message: "row is locked" } : null };
      },
    }),
  }));
}

const db = { from: fromMock, rpc: vi.fn(async () => ({ error: null })) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  refundsCreate.mockResolvedValue({ id: "re_1", amount: 10000 });
  reversalCreate.mockResolvedValue({ id: "trr_1" });
});

describe("a DB write that fails after the money moved", () => {
  it("alerts when the buyer is refunded but the request cannot be marked approved", async () => {
    // Left silent, the admin refunds queue keeps showing it as outstanding and
    // a second refund of real money is one click away.
    setupDb({ failWrite: "refund_requests" });
    await processCancellationRefund(db, { refundRequestId: "rr-1", orderId: "o1" });

    expect(refundsCreate).toHaveBeenCalledTimes(1);
    const alerts = sendAdminAlertMock.mock.calls as unknown as Array<
      [{ idempotencyKey: string; summary: string }]
    >;
    const alert = alerts.map((c) => c[0]).find((a) => a.idempotencyKey === "cancel_refund_unrecorded:o1");
    expect(alert).toBeTruthy();
    expect(alert!.summary).toMatch(/do NOT refund it again/i);
  });

  it("alerts when a transfer is reversed in Stripe but the ledger row does not update", async () => {
    setupDb({
      paidLegs: [{ id: "leg-1", stripe_transfer_id: "tr_1" }],
      failWrite: "stripe_transfers",
    });
    await processCancellationRefund(db, { refundRequestId: "rr-1", orderId: "o1" });

    expect(reversalCreate).toHaveBeenCalledTimes(1);
    const keys = (sendAdminAlertMock.mock.calls as unknown as Array<[{ idempotencyKey: string }]>)
      .map((c) => c[0].idempotencyKey);
    expect(keys).toContain("cancel_reversal_unrecorded:o1:leg-1");
  });

  it("stays quiet when every write lands", async () => {
    setupDb({ paidLegs: [{ id: "leg-1", stripe_transfer_id: "tr_1" }] });
    await processCancellationRefund(db, { refundRequestId: "rr-1", orderId: "o1" });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});

describe("the refund is recorded so the webhook can recognise it (email audit fix 3)", () => {
  it("writes the Stripe refund id, the approved status and a processed time onto the request", async () => {
    // charge.refunded fires for this refund too. The order stays `cancelled`,
    // so the webhook's only way to know the refund is ours is this row.
    setupDb();
    await processCancellationRefund(db, { refundRequestId: "rr-1", orderId: "o1" });

    const request = writes.find((w) => w.table === "refund_requests");
    expect(request).toBeTruthy();
    expect(request!.row).toMatchObject({ status: "approved", stripe_refund_id: "re_1" });
    expect(typeof request!.row.processed_at).toBe("string");
  });

  it("does not touch the order's status: cancelled stays cancelled", async () => {
    setupDb();
    await processCancellationRefund(db, { refundRequestId: "rr-1", orderId: "o1" });
    expect(writes.some((w) => w.table === "orders")).toBe(false);
  });
});
