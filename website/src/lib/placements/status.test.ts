import { describe, it, expect } from "vitest";
import { arrangementLabel } from "./status";

// P6 (Phase 2.1) guard: the optimistic-insert path on the artist and
// venue placement pages now calls arrangementLabel() to derive the
// row label, instead of hard-coded "Revenue Share" / "Paid Loan"
// strings. This test locks the canonical labels so any future change
// to the helper would also flip the optimistic paths together.
describe("arrangementLabel() casing matches the canonical UI labels", () => {
  it("returns 'Revenue share' (lowercase s)", () => {
    expect(
      arrangementLabel({ arrangement_type: "revenue_share", qr_enabled: false }),
    ).toBe("Revenue share");
  });

  it("returns 'Paid loan' for a paid arrangement", () => {
    expect(
      arrangementLabel({
        arrangement_type: "paid_loan",
        monthly_fee_gbp: 50,
        qr_enabled: false,
      }),
    ).toBe("Paid loan");
  });

  it("returns 'Paid loan + QR' for mixed", () => {
    expect(
      arrangementLabel({
        arrangement_type: "mixed",
        monthly_fee_gbp: 50,
        qr_enabled: true,
      }),
    ).toBe("Paid loan + QR");
  });

  it("returns 'Free display' for free_loan", () => {
    expect(
      arrangementLabel({ arrangement_type: "free_loan", qr_enabled: false }),
    ).toBe("Free display");
  });

  it("returns 'Direct purchase' for purchase", () => {
    expect(
      arrangementLabel({ arrangement_type: "purchase", qr_enabled: false }),
    ).toBe("Direct purchase");
  });
});
