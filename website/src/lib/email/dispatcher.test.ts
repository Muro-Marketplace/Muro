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
  // need a missing template override this with mockReturnValueOnce(undefined).
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
      idempotencyKey: "order_placed:order_1",
      category: "orders_and_payouts",
    });
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
});
