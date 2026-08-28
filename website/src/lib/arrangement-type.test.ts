import { describe, it, expect } from "vitest";
import {
  isPaidLoan,
  isFreeDisplay,
  isRevenueShare,
  isPurchase,
  isLoan,
} from "./arrangement-type";

describe("isPaidLoan", () => {
  it("is true for the canonical paid_loan value", () => {
    expect(isPaidLoan("paid_loan")).toBe(true);
  });
  it("is true for mixed (paid loan + revenue share)", () => {
    expect(isPaidLoan("mixed")).toBe(true);
  });
  it("is true for legacy free_loan WHEN a positive monthly fee is attached", () => {
    expect(isPaidLoan("free_loan", 50)).toBe(true);
  });
  it("is false for free_loan with no fee (that is a free display, not a paid loan)", () => {
    expect(isPaidLoan("free_loan", 0)).toBe(false);
    expect(isPaidLoan("free_loan")).toBe(false);
  });
  it("is false for purchase and revenue_share", () => {
    expect(isPaidLoan("purchase")).toBe(false);
    expect(isPaidLoan("revenue_share")).toBe(false);
  });
  it("is false for null / unknown", () => {
    expect(isPaidLoan(null)).toBe(false);
    expect(isPaidLoan(undefined)).toBe(false);
    expect(isPaidLoan("something_else")).toBe(false);
  });
});

describe("isFreeDisplay", () => {
  it("is true only for free_loan with no positive fee", () => {
    expect(isFreeDisplay("free_loan", 0)).toBe(true);
    expect(isFreeDisplay("free_loan")).toBe(true);
  });
  it("is false for free_loan with a fee (that is a paid loan)", () => {
    expect(isFreeDisplay("free_loan", 50)).toBe(false);
  });
  it("is false for paid_loan / purchase / revenue_share", () => {
    expect(isFreeDisplay("paid_loan")).toBe(false);
    expect(isFreeDisplay("purchase")).toBe(false);
    expect(isFreeDisplay("revenue_share")).toBe(false);
  });
});

describe("isRevenueShare", () => {
  it("is true for revenue_share and mixed", () => {
    expect(isRevenueShare("revenue_share")).toBe(true);
    expect(isRevenueShare("mixed")).toBe(true);
  });
  it("is false for paid_loan / free_loan / purchase", () => {
    expect(isRevenueShare("paid_loan")).toBe(false);
    expect(isRevenueShare("free_loan")).toBe(false);
    expect(isRevenueShare("purchase")).toBe(false);
  });
});

describe("isPurchase", () => {
  it("is true only for purchase", () => {
    expect(isPurchase("purchase")).toBe(true);
    expect(isPurchase("paid_loan")).toBe(false);
    expect(isPurchase("free_loan")).toBe(false);
    expect(isPurchase("mixed")).toBe(false);
  });
});

describe("isLoan", () => {
  it("is true for any loan-like arrangement: paid_loan, free_loan (any fee), mixed", () => {
    expect(isLoan("paid_loan")).toBe(true);
    expect(isLoan("free_loan")).toBe(true);
    expect(isLoan("mixed")).toBe(true);
  });
  it("is false for purchase and revenue_share (so a paid loan never renders the purchase box)", () => {
    expect(isLoan("purchase")).toBe(false);
    expect(isLoan("revenue_share")).toBe(false);
    expect(isLoan(null)).toBe(false);
  });
});

// K3: the `arrangementLabel` alias this block tested is deleted. It renamed
// labelForArrangement to collide with a DIFFERENT function of the same name in
// placements/status.ts, so which one a file got depended on its import line.
// Its behaviour is covered in arrangement-labels.test.ts.
