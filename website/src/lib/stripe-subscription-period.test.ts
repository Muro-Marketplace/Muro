import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { periodFromSubscription, epochToIso, epochToUkDate } from "./stripe-subscription-period";

// E11b (04 §B6). `new Date((subscription.items.data[0]?.current_period_end ?? 0) *
// 1000)` stamped 1970-01-01 whenever Stripe omitted the period: the artist billing
// page showed a subscription that expired 56 years ago, and the upgrade email
// quoted "1 January 1970" as the next billing date.

const sub = (item?: Record<string, unknown>): Stripe.Subscription =>
  ({ items: { data: item ? [item] : [] } }) as unknown as Stripe.Subscription;

describe("periodFromSubscription", () => {
  it("reads the bounds off the first item, where SDK 22 keeps them", () => {
    expect(periodFromSubscription(sub({ current_period_start: 100, current_period_end: 200 }))).toEqual(
      { cpStart: 100, cpEnd: 200 },
    );
  });

  it("returns nulls when the item carries no period", () => {
    expect(periodFromSubscription(sub({}))).toEqual({ cpStart: null, cpEnd: null });
  });

  it("returns nulls for a subscription with no items", () => {
    expect(periodFromSubscription(sub())).toEqual({ cpStart: null, cpEnd: null });
  });

  it("ignores period fields on the subscription itself", () => {
    // Where the SDK used to keep them. Reading there now yields undefined, which
    // is precisely what `?? 0` turned into 1970.
    const legacy = {
      current_period_start: 100,
      current_period_end: 200,
      items: { data: [{}] },
    } as unknown as Stripe.Subscription;
    expect(periodFromSubscription(legacy)).toEqual({ cpStart: null, cpEnd: null });
  });
});

describe("epochToIso", () => {
  it("converts a real timestamp", () => {
    expect(epochToIso(1_702_000_000)).toBe(new Date(1_702_000_000 * 1000).toISOString());
  });

  it("never stamps 1970 for 0, null or undefined", () => {
    for (const v of [0, null, undefined]) {
      expect(epochToIso(v)).toBeNull();
    }
  });
});

describe("epochToUkDate", () => {
  it("formats a real timestamp for UK readers", () => {
    expect(epochToUkDate(1_702_000_000)).toMatch(/December 2023/);
  });

  it("reads correctly when the date is unknown, rather than saying 1 January 1970", () => {
    for (const v of [0, null, undefined]) {
      expect(epochToUkDate(v)).toBe("your next billing date");
      expect(epochToUkDate(v)).not.toMatch(/1970/);
    }
  });

  it("takes a custom fallback", () => {
    expect(epochToUkDate(null, "soon")).toBe("soon");
  });
});
