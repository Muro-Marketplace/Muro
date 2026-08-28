import { describe, it, expect } from "vitest";
import { orderIdFromSession, classifyOrderIdConflict } from "./order-id";

// D3 (04 §B0). `WS-${session.id.slice(-8)}` collided on 8 chars and the webhook
// then reported the collision as a duplicate, dropping the second buyer's order.

describe("orderIdFromSession", () => {
  it("takes 16 chars of session entropy after the last underscore, uppercased", () => {
    // A real session id: cs_live_ + 24+ entropy chars.
    // entropy = "a1B2c3D4e5F6g7H8i9J0k1L2" (24 chars); last 16, uppercased.
    const id = orderIdFromSession("WS", "cs_live_a1B2c3D4e5F6g7H8i9J0k1L2");
    expect(id).toBe("WS-E5F6G7H8I9J0K1L2");
  });

  it("uppercases so the id is case-stable", () => {
    expect(orderIdFromSession("WS", "cs_test_abcdefghijklmnop")).toBe("WS-ABCDEFGHIJKLMNOP");
  });

  it("uses the OFR prefix for offers", () => {
    expect(orderIdFromSession("OFR", "cs_test_zzzzzzzzzzzzzzzz")).toBe("OFR-ZZZZZZZZZZZZZZZZ");
  });

  it("is 16 entropy chars wide when the session has enough, vs the old 8", () => {
    const id = orderIdFromSession("WS", "cs_live_0123456789abcdefghij");
    expect(id.replace("WS-", "")).toHaveLength(16);
  });

  it("two different sessions that shared the last 8 chars no longer collide", () => {
    // Both end ...WXYZ1234 — the old slice(-8) made these identical.
    const a = orderIdFromSession("WS", "cs_live_AAAAAAAAAAAAWXYZ1234");
    const b = orderIdFromSession("WS", "cs_live_BBBBBBBBBBBBWXYZ1234");
    expect(a).not.toBe(b);
  });

  it("degrades to the whole id when there is no underscore", () => {
    expect(orderIdFromSession("WS", "abcdefghijklmnopqrst")).toBe("WS-EFGHIJKLMNOPQRST");
  });
});

describe("classifyOrderIdConflict", () => {
  function dbReturning(row: { stripe_payment_intent_id: string | null } | null) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      }),
    } as unknown as Parameters<typeof classifyOrderIdConflict>[0];
  }

  it("is a duplicate when the clashing row has the same payment intent", async () => {
    const kind = await classifyOrderIdConflict(dbReturning({ stripe_payment_intent_id: "pi_1" }), "WS-X", "pi_1");
    expect(kind).toBe("duplicate");
  });

  it("is a collision when the clashing row has a different payment intent", async () => {
    // The case the old code got wrong: it would have said duplicate and dropped
    // the second buyer's paid order.
    const kind = await classifyOrderIdConflict(dbReturning({ stripe_payment_intent_id: "pi_OTHER" }), "WS-X", "pi_1");
    expect(kind).toBe("collision");
  });

  it("treats a same null intent as a duplicate (a null-intent redelivery)", async () => {
    const kind = await classifyOrderIdConflict(dbReturning({ stripe_payment_intent_id: null }), "WS-X", null);
    expect(kind).toBe("duplicate");
  });

  it("is a collision when the row has no intent but the payment does", async () => {
    const kind = await classifyOrderIdConflict(dbReturning({ stripe_payment_intent_id: null }), "WS-X", "pi_1");
    expect(kind).toBe("collision");
  });

  it("is a collision when the clashing row cannot be found, so we retry not drop", async () => {
    const kind = await classifyOrderIdConflict(dbReturning(null), "WS-X", "pi_1");
    expect(kind).toBe("collision");
  });
});
