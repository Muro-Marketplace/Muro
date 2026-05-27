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

  it("for order.cancelled / refunded / delivery_confirmed there is no Phase 2 email yet (legacy paths cover)", async () => {
    for (const status of ["cancelled"]) {
      sendTransactionalMock.mockClear();
      await recordOrderEvent({
        orderId: "o1",
        newStatus: status,
        buyerEmail: "b@e.com",
        artistEmail: "a@e.com",
        data: {},
      });
      expect(sendTransactionalMock).not.toHaveBeenCalled();
    }
  });
});
