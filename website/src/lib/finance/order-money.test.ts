// K6 (07 §6). The per-order money rules, which had four copies.

import { describe, it, expect } from "vitest";
import {
  NON_REVENUE_STATUSES,
  artistPayoutPence,
  artistPayoutPounds,
  formatPounds,
  isRevenueBearing,
  orderGrossPence,
  poundsToPence,
} from "./order-money";

describe("isRevenueBearing", () => {
  it("excludes refunded, which is the disagreement K6 is about", () => {
    // /api/admin/stats excluded refunded; /api/admin/financials excluded only
    // cancelled, so it counted money returned to a buyer as revenue.
    expect(isRevenueBearing({ status: "refunded" })).toBe(false);
    expect(isRevenueBearing({ status: "partially_refunded" })).toBe(false);
  });

  it("excludes cancelled, failed and void", () => {
    for (const status of ["cancelled", "failed", "void"]) {
      expect(isRevenueBearing({ status }), status).toBe(false);
    }
  });

  it("counts the lifecycle statuses a real order passes through", () => {
    for (const status of ["paid", "processing", "shipped", "delivered", "completed"]) {
      expect(isRevenueBearing({ status }), status).toBe(true);
    }
  });

  it("is case-insensitive, because legacy rows are capitalised", () => {
    expect(isRevenueBearing({ status: "Refunded" })).toBe(false);
    expect(isRevenueBearing({ status: "CANCELLED" })).toBe(false);
  });

  it("counts an order with no status rather than silently dropping it", () => {
    expect(isRevenueBearing({})).toBe(true);
    expect(isRevenueBearing({ status: null })).toBe(true);
  });

  it("exposes the status set so a caller cannot invent a fifth definition", () => {
    expect([...NON_REVENUE_STATUSES].sort()).toEqual([
      "cancelled",
      "failed",
      "partially_refunded",
      "refunded",
      "void",
    ]);
  });
});

describe("poundsToPence", () => {
  it("converts to integer pence", () => {
    expect(poundsToPence(12.5)).toBe(1250);
    expect(poundsToPence(0)).toBe(0);
    expect(poundsToPence(773.25)).toBe(77325);
  });

  it("rounds rather than truncating, so float storage cannot lose a penny", () => {
    // 0.1 + 0.2 style drift: 8.115 stored as a float is 8.114999...
    expect(poundsToPence(8.115)).toBe(812);
    expect(poundsToPence(19.99 * 3)).toBe(5997);
  });

  it("treats null, undefined and NaN as zero rather than propagating them", () => {
    expect(poundsToPence(null)).toBe(0);
    expect(poundsToPence(undefined)).toBe(0);
    expect(poundsToPence(Number.NaN)).toBe(0);
    expect(poundsToPence(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("artistPayoutPounds", () => {
  it("prefers artist_revenue", () => {
    expect(artistPayoutPounds({ artist_revenue: 42.5, total: 99.99 })).toBe(42.5);
  });

  it("keeps a real zero payout at zero", () => {
    // A zero is not a missing value. It is a fully-discounted order, or one
    // whose artist attribution failed (D4). Showing the buyer-paid gross as the
    // artist's earnings there would be a lie about who got the money.
    expect(artistPayoutPounds({ artist_revenue: 0, total: 99.99 })).toBe(0);
  });

  it("falls back to total only for legacy rows with no artist_revenue", () => {
    expect(artistPayoutPounds({ artist_revenue: null, total: 99.99 })).toBe(99.99);
    expect(artistPayoutPounds({ total: 99.99 })).toBe(99.99);
  });

  it("never returns NaN", () => {
    // The artist-portal/orders copy had no finite guard, so a NaN rendered as
    // "£NaN" on the page instead of falling back.
    expect(artistPayoutPounds({ artist_revenue: Number.NaN, total: 99.99 })).toBe(99.99);
    expect(artistPayoutPounds({ artist_revenue: Number.NaN, total: Number.NaN })).toBe(0);
    expect(artistPayoutPounds({})).toBe(0);
  });

  it("agrees with its own pence form", () => {
    expect(artistPayoutPence({ artist_revenue: 42.55 })).toBe(4255);
    expect(artistPayoutPence({ artist_revenue: 0, total: 99.99 })).toBe(0);
  });
});

describe("orderGrossPence", () => {
  it("is the buyer-paid total, not the artist's share", () => {
    expect(orderGrossPence({ total: 99.99, artist_revenue: 42.5 })).toBe(9999);
  });
});

describe("formatPounds", () => {
  it("renders two decimal places", () => {
    expect(formatPounds(12.5)).toBe("12.50");
    expect(formatPounds(0)).toBe("0.00");
  });

  it("renders 0.00 rather than NaN", () => {
    expect(formatPounds(Number.NaN)).toBe("0.00");
  });
});
