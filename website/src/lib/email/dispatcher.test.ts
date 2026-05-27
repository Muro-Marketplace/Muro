import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock, findTemplateMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  findTemplateMock: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/emails/registry", () => ({ findTemplate: findTemplateMock }));

import { sendTransactional } from "./dispatcher";

beforeEach(() => {
  sendEmailMock.mockReset();
  findTemplateMock.mockReset();
  // Default: every registry lookup resolves to a tiny stub entry. Tests that
  // need a missing template override this with mockReturnValueOnce(undefined),
  // and tests covering token substitution override the subject.
  findTemplateMock.mockReturnValue({
    id: "stub",
    component: () => null,
    subject: "Stub subject",
    category: "orders_and_payouts",
  });
});

describe("sendTransactional()", () => {
  it("returns sent:true, deduped:false on a fresh send", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_1" });

    const res = await sendTransactional({
      to: "buyer@example.com",
      template: "order_placed",
      data: { firstName: "Sam" },
      idempotencyKey: "order_placed:order_1",
    });

    expect(res).toEqual({ sent: true, deduped: false });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "buyer@example.com",
      category: "orders_and_payouts",
    });
  });

  it("suffixes the idempotency key with the spec template name", async () => {
    // Phase 2 may bind two spec templates to one registry entry. The
    // suffix keeps their email_events rows distinct.
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_a" });

    await sendTransactional({
      to: "buyer@example.com",
      template: "order_delivered",
      data: {},
      idempotencyKey: "shared-key:order_99",
    });
    await sendTransactional({
      to: "buyer@example.com",
      template: "customer_confirm_delivery",
      data: {},
      idempotencyKey: "shared-key:order_99",
    });

    const k1 = sendEmailMock.mock.calls[0][0].idempotencyKey;
    const k2 = sendEmailMock.mock.calls[1][0].idempotencyKey;
    expect(k1).toBe("shared-key:order_99:order_delivered");
    expect(k2).toBe("shared-key:order_99:customer_confirm_delivery");
    expect(k1).not.toBe(k2);
  });

  it("substitutes {{token}} placeholders in the registry subject", async () => {
    findTemplateMock.mockReturnValueOnce({
      id: "stub",
      component: () => null,
      subject: "Your order {{orderNumber}} is on its way",
      category: "orders_and_payouts",
    });
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_2" });

    await sendTransactional({
      to: "buyer@example.com",
      template: "order_processing",
      data: { orderNumber: "WP-0123" },
      idempotencyKey: "order_processing:order_2",
    });

    expect(sendEmailMock.mock.calls[0][0].subject).toBe("Your order WP-0123 is on its way");
  });

  it("leaves unknown tokens in place so missing data is visible", async () => {
    findTemplateMock.mockReturnValueOnce({
      id: "stub",
      component: () => null,
      subject: "Hi {{firstName}}, your order {{orderNumber}}",
      category: "orders_and_payouts",
    });
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_3" });

    await sendTransactional({
      to: "buyer@example.com",
      template: "order_placed",
      data: { firstName: "Sam" },
      idempotencyKey: "order_placed:order_3",
    });

    expect(sendEmailMock.mock.calls[0][0].subject).toBe("Hi Sam, your order {{orderNumber}}");
  });

  it("returns sent:true, deduped:true when sendEmail reports a duplicate key", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, skipped: true, reason: "duplicate" });

    const res = await sendTransactional({
      to: "buyer@example.com",
      template: "order_placed",
      data: {},
      idempotencyKey: "order_placed:order_1",
    });

    expect(res).toEqual({ sent: true, deduped: true });
  });

  it("returns sent:false on suppression / opt-out (not a dedupe)", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, skipped: true, reason: "suppressed" });

    const res = await sendTransactional({
      to: "blocked@example.com",
      template: "order_delivered",
      data: {},
      idempotencyKey: "order_delivered:order_2",
    });

    expect(res).toEqual({ sent: false, deduped: false });
  });

  it("returns sent:false on a transport error", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: "Resend 500" });

    const res = await sendTransactional({
      to: "buyer@example.com",
      template: "order_processing",
      data: {},
      idempotencyKey: "order_processing:order_3",
    });

    expect(res).toEqual({ sent: false, deduped: false });
  });

  it("returns sent:false when the template binding can't resolve", async () => {
    findTemplateMock.mockReturnValueOnce(undefined);

    const res = await sendTransactional({
      to: "buyer@example.com",
      template: "customer_confirm_delivery",
      data: {},
      idempotencyKey: "customer_confirm_delivery:order_4",
    });

    expect(res).toEqual({ sent: false, deduped: false });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("passes the user id through when supplied", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_5" });

    await sendTransactional({
      to: "buyer@example.com",
      template: "order_placed",
      data: {},
      idempotencyKey: "order_placed:order_5",
      userId: "user_42",
    });

    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ userId: "user_42" });
  });

  it("accepts the Phase 2.0c lifecycle event names without falling through to a missing-template path", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "msg_lifecycle" });
    const names: Array<
      | "artist_order_received"
      | "order_out_for_delivery"
    > = ["artist_order_received", "order_out_for_delivery"];
    for (const name of names) {
      await sendTransactional({
        to: "buyer@example.com",
        template: name,
        data: {},
        idempotencyKey: `${name}:order_lifecycle`,
      });
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(names.length);
  });
});
