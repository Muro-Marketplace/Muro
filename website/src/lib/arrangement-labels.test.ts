import { describe, expect, it } from "vitest";
import { ARRANGEMENT_LABEL, labelForArrangement, ARRANGEMENT_TYPES } from "./arrangement-labels";

describe("arrangement-labels", () => {
  it("exports the three canonical types in stable order", () => {
    expect(ARRANGEMENT_TYPES).toEqual(["paid_loan", "revenue_share", "purchase"]);
  });

  it("labels each type with its canonical name", () => {
    expect(ARRANGEMENT_LABEL.paid_loan).toBe("Paid loan");
    expect(ARRANGEMENT_LABEL.revenue_share).toBe("Revenue-share loan (QR-enabled)");
    expect(ARRANGEMENT_LABEL.purchase).toBe("Direct purchase");
  });

  it("labelForArrangement: known types pass through", () => {
    expect(labelForArrangement("paid_loan")).toBe("Paid loan");
    expect(labelForArrangement("revenue_share")).toBe("Revenue-share loan (QR-enabled)");
    expect(labelForArrangement("purchase")).toBe("Direct purchase");
  });

  it("labelForArrangement: legacy 'free_loan' alias maps to 'paid_loan'", () => {
    expect(labelForArrangement("free_loan")).toBe("Paid loan");
  });

  it("labelForArrangement: unknown / null / undefined fall back to a sensible default", () => {
    expect(labelForArrangement("nonsense")).toBe("Other arrangement");
    expect(labelForArrangement(null)).toBe("Other arrangement");
    expect(labelForArrangement(undefined)).toBe("Other arrangement");
    expect(labelForArrangement("")).toBe("Other arrangement");
  });
});
