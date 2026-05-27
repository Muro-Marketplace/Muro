import { describe, it, expect } from "vitest";
import { deriveArrangementType } from "./arrangement";

describe("deriveArrangementType()", () => {
  it("returns 'purchase' when purchase_amount_pence > 0", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 50,
        qr_enabled: true,
        revenue_share_percent: 10,
        purchase_amount_pence: 25_000,
      }),
    ).toBe("purchase");
  });

  it("returns 'mixed' when paid AND qr_enabled", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 75,
        qr_enabled: true,
        revenue_share_percent: null,
      }),
    ).toBe("mixed");
  });

  it("returns 'paid_loan' when monthly fee > 0 and qr disabled", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 75,
        qr_enabled: false,
        revenue_share_percent: null,
      }),
    ).toBe("paid_loan");
  });

  it("returns 'revenue_share' when revenue_share_percent > 0", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: null,
        qr_enabled: false,
        revenue_share_percent: 15,
      }),
    ).toBe("revenue_share");
  });

  it("returns 'revenue_share' when qr_enabled but no fee or rev split set", () => {
    // Legacy QR-only loans imply rev-share, matching arrangementLabel().
    expect(
      deriveArrangementType({
        monthly_fee_gbp: null,
        qr_enabled: true,
        revenue_share_percent: null,
      }),
    ).toBe("revenue_share");
  });

  it("returns 'free_loan' when everything is null/zero/false", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: null,
        qr_enabled: false,
        revenue_share_percent: null,
      }),
    ).toBe("free_loan");

    expect(
      deriveArrangementType({
        monthly_fee_gbp: 0,
        qr_enabled: false,
        revenue_share_percent: 0,
        purchase_amount_pence: 0,
      }),
    ).toBe("free_loan");
  });

  it("treats negative or NaN fees as inactive", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: -1,
        qr_enabled: false,
        revenue_share_percent: null,
      }),
    ).toBe("free_loan");
  });

  it("matches the Phase 1 SQL CASE backfill: paid_loan precedence over revenue_share when both set", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 50,
        qr_enabled: false,
        revenue_share_percent: 10,
      }),
    ).toBe("paid_loan");
  });

  it("matches the Phase 1 SQL CASE backfill: mixed precedence over paid_loan when QR is on too", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 50,
        qr_enabled: true,
        revenue_share_percent: 10,
      }),
    ).toBe("mixed");
  });

  it("matches the Phase 1 SQL CASE backfill: purchase wins over everything", () => {
    expect(
      deriveArrangementType({
        monthly_fee_gbp: 50,
        qr_enabled: true,
        revenue_share_percent: 10,
        purchase_amount_pence: 250_000,
      }),
    ).toBe("purchase");
  });
});
