// `checkout.session.completed` does not mean paid.

import { describe, it, expect } from "vitest";
import { isSettled } from "./settlement";

const s = (payment_status: unknown) =>
  ({ payment_status }) as Parameters<typeof isSettled>[0];

describe("isSettled", () => {
  it("accepts a paid session", () => {
    expect(isSettled(s("paid"))).toBe(true);
  });

  it("REFUSES an unpaid session", () => {
    // THE gate. A delayed payment method fires `completed` with this and settles
    // days later, or never. Booking it schedules an artist transfer against
    // money that has not arrived.
    expect(isSettled(s("unpaid"))).toBe(false);
  });

  it("accepts no_payment_required", () => {
    // A zero-total session: a 100% discount, or a trial that bills nothing
    // today. Nothing is owed, so it is settled. Gating on `=== "paid"`, which is
    // what the plan literally says, would refuse a legitimate free order.
    expect(isSettled(s("no_payment_required"))).toBe(true);
  });

  it("treats an ABSENT status as settled, rather than refusing every order", () => {
    // Older API versions omit the field on some sessions. Refusing on absence
    // would stop booking everything, not just the sessions at risk.
    expect(isSettled(s(undefined))).toBe(true);
    expect(isSettled(s(null))).toBe(true);
  });

  it("REFUSES a value Stripe has not used yet", () => {
    // The two failures are not symmetric. Accepting an unknown value books
    // orders and schedules payouts against money that may never arrive,
    // silently. Refusing one halts booking, which is loud, noticed within
    // minutes, and fixed by adding the value to the list.
    expect(isSettled(s("something_new"))).toBe(false);
  });

  it("distinguishes ABSENT from UNKNOWN, and only absent is allowed through", () => {
    // Absence is a compatibility case: older API versions omit the field, and
    // every hand-built test fixture omits it. An unrecognised value is a
    // semantics case, and gets no such benefit of the doubt.
    expect(isSettled(s(undefined))).toBe(true);
    expect(isSettled(s(""))).toBe(false);
  });
});
