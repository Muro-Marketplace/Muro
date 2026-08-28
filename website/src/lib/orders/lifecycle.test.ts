import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendTransactionalMock, upsertMock } = vi.hoisted(() => ({
  sendTransactionalMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/email/dispatcher", () => ({
  sendTransactional: sendTransactionalMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

import { recordOrderEvent } from "./lifecycle";

beforeEach(() => {
  sendTransactionalMock.mockReset();
  sendTransactionalMock.mockResolvedValue({ sent: true, deduped: false });
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ data: null, error: null });
});

describe("recordOrderEvent()", () => {
  it("returns null when the status has no mapped event", async () => {
    const res = await recordOrderEvent({
      orderId: "o1",
      newStatus: "artist_notified",
      data: {},
    });
    expect(res.eventType).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(sendTransactionalMock).not.toHaveBeenCalled();
  });

  it("on order.placed fires both Artist + Customer templates", async () => {
    const res = await recordOrderEvent({
      orderId: "o1",
      newStatus: "confirmed",
      buyerEmail: "buyer@example.com",
      artistEmail: "artist@example.com",
      data: { firstName: "Sam" },
    });
    expect(res.eventType).toBe("order.placed");
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(sendTransactionalMock).toHaveBeenCalledTimes(2);
    const templates = sendTransactionalMock.mock.calls.map(
      (c: unknown[]) => (c[0] as { template: string }).template,
    );
    expect(templates).toContain("artist_order_received");
    expect(templates).toContain("order_placed");
  });

  it("on order.processing fires only the customer template", async () => {
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "processing",
      buyerEmail: "buyer@example.com",
      artistEmail: "artist@example.com",
      data: {},
    });
    expect(sendTransactionalMock).toHaveBeenCalledTimes(1);
    expect(sendTransactionalMock.mock.calls[0][0].template).toBe("order_processing");
  });

  it("on order.out_for_delivery + order.delivered fires the customer templates", async () => {
    sendTransactionalMock.mockClear();
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "shipped",
      buyerEmail: "buyer@example.com",
      data: {},
    });
    expect(sendTransactionalMock.mock.calls[0][0].template).toBe("order_out_for_delivery");

    sendTransactionalMock.mockClear();
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "delivered",
      buyerEmail: "buyer@example.com",
      data: {},
    });
    expect(sendTransactionalMock.mock.calls[0][0].template).toBe("order_delivered");
  });

  it("passes the order:event idempotency key to the dispatcher", async () => {
    await recordOrderEvent({
      orderId: "o42",
      newStatus: "confirmed",
      buyerEmail: "b@e.com",
      data: {},
    });
    expect(
      sendTransactionalMock.mock.calls.every(
        (c: unknown[]) =>
          (c[0] as { idempotencyKey: string }).idempotencyKey === "o42:order.placed",
      ),
    ).toBe(true);
  });

  it("skips email triggers with no recipient address", async () => {
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "confirmed",
      buyerEmail: null,
      artistEmail: null,
      data: {},
    });
    expect(sendTransactionalMock).not.toHaveBeenCalled();
  });

  it("sends the cancellation from here, not from a second branch in the route (09 item 1.5)", async () => {
    // REVERSAL. This used to assert `not.toHaveBeenCalled()` for `cancelled`,
    // because an `if (status !== shipped && !== delivered && !== processing)`
    // branch inside orders/route.ts owned it instead. Two owners for "which
    // email does an order event produce" is how a status ends up sending twice,
    // or not at all.
    sendTransactionalMock.mockClear();
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "cancelled",
      buyerEmail: "b@e.com",
      artistEmail: "a@e.com",
      data: {},
    });

    expect(sendTransactionalMock).toHaveBeenCalledTimes(1);
    expect(sendTransactionalMock.mock.calls[0][0]).toMatchObject({
      to: "b@e.com",
      template: "order_cancelled",
    });
  });

  it("still sends nothing for refunded, so a refund cannot email the buyer twice", async () => {
    // refunds/process already sends CustomerRefundConfirmation. A trigger here
    // would reproduce the duplicate-send defect K1 removed from that route.
    sendTransactionalMock.mockClear();
    await recordOrderEvent({
      orderId: "o1",
      newStatus: "refunded",
      buyerEmail: "b@e.com",
      artistEmail: "a@e.com",
      data: {},
    });
    expect(sendTransactionalMock).not.toHaveBeenCalled();
  });
});
