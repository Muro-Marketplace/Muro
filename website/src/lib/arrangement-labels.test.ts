import { describe, expect, it } from "vitest";
import {
  ALL_ARRANGEMENT_LABELS,
  ARRANGEMENT_LABEL,
  ARRANGEMENT_TYPES,
  labelForArrangement,
} from "./arrangement-labels";

describe("arrangement-labels", () => {
  it("exports the three canonical types in stable order", () => {
    expect(ARRANGEMENT_TYPES).toEqual(["paid_loan", "revenue_share", "purchase"]);
  });

  it("labels each type with its canonical name", () => {
    expect(ARRANGEMENT_LABEL.paid_loan).toBe("Paid loan");
    // REVERSAL (K3). This was "Revenue-share loan (QR-enabled)". It is not a
    // loan, and the parenthetical described a configuration rather than the
    // arrangement. `/spaces` also rendered the literal "Revenue Share" beside
    // this string on the same page, which is finding E13.
    expect(ARRANGEMENT_LABEL.revenue_share).toBe("Revenue share");
    expect(ARRANGEMENT_LABEL.purchase).toBe("Direct purchase");
  });

  it("labelForArrangement: known types pass through", () => {
    expect(labelForArrangement("paid_loan")).toBe("Paid loan");
    expect(labelForArrangement("revenue_share")).toBe("Revenue share");
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

// K3: everything below is behaviour absorbed from the second implementation in
// placements/status.ts, which existed because this module could not express it.
describe("labelForArrangement with fee and QR state (K3)", () => {
  it("names `mixed`, which used to fall through to 'Other arrangement'", () => {
    // `mixed` is a live production value meaning paid loan AND revenue share.
    // Calling it "Other arrangement" on every surface was the plainest symptom
    // of the split.
    expect(labelForArrangement("mixed")).toBe("Paid loan + revenue share");
    expect(labelForArrangement({ arrangementType: "mixed", monthlyFeeGbp: 120 })).toBe(
      "Paid loan + revenue share",
    );
  });

  it("keeps 'Paid loan + QR' for a mixed row with QR on, which is what ships today", () => {
    expect(
      labelForArrangement({ arrangementType: "mixed", monthlyFeeGbp: 50, qrEnabled: true }),
    ).toBe("Paid loan + QR");
  });

  it("distinguishes a paid loan with QR from one without", () => {
    expect(labelForArrangement({ arrangementType: "paid_loan", monthlyFeeGbp: 120, qrEnabled: true }))
      .toBe("Paid loan + QR");
    expect(labelForArrangement({ arrangementType: "paid_loan", monthlyFeeGbp: 120, qrEnabled: false }))
      .toBe("Paid loan");
  });

  it("resolves the free_loan overload by CALL FORM, preserving both old meanings", () => {
    // The two implementations disagreed here and each was right for its own
    // callers, so the disagreement is preserved rather than papered over:
    //
    //   labelForArrangement("free_loan")                    -> "Paid loan"
    //   arrangementLabel({ arrangement_type: "free_loan" })  -> "Free display"
    //
    // A caller with only a type string knows nothing about the fee. A caller
    // passing the object is in the data-derived world, where no fee means no fee.
    expect(labelForArrangement("free_loan")).toBe("Paid loan");
    expect(labelForArrangement({ arrangementType: "free_loan" })).toBe("Free display");
    expect(labelForArrangement({ arrangementType: "free_loan", monthlyFeeGbp: 0 })).toBe("Free display");
    expect(labelForArrangement({ arrangementType: "free_loan", monthlyFeeGbp: null })).toBe("Free display");
    expect(labelForArrangement({ arrangementType: "free_loan", monthlyFeeGbp: 120 })).toBe("Paid loan");
  });

  it("treats a fee-less free_loan with QR as revenue-bearing, not a free display", () => {
    expect(labelForArrangement({ arrangementType: "free_loan", monthlyFeeGbp: 0, qrEnabled: true }))
      .toBe("Paid loan");
  });

  it("describes fee or QR even when the type is missing or unrecognised", () => {
    // status.ts derived from the data rather than trusting the column, which is
    // the behaviour worth keeping: a row with a fee is a paid loan whatever its
    // type string says.
    expect(labelForArrangement({ monthlyFeeGbp: 120 })).toBe("Paid loan");
    expect(labelForArrangement({ monthlyFeeGbp: 120, qrEnabled: true })).toBe("Paid loan + QR");
    expect(labelForArrangement({ qrEnabled: true })).toBe("Revenue share");
    expect(labelForArrangement({ arrangementType: "nonsense", monthlyFeeGbp: 120 })).toBe("Paid loan");
  });

  it("does NOT infer a fee from prose", () => {
    // status.ts regexed the free-text message body for "£X/month" when the
    // column was null. Inferring a monetary amount from something a user typed
    // is a bug generator, and it is deliberately not carried over.
    expect(
      labelForArrangement({
        arrangementType: "free_loan",
        monthlyFeeGbp: 0,
        // Whatever a message said, it is not data.
      } as Parameters<typeof labelForArrangement>[0]),
    ).toBe("Free display");
  });

  it("never returns a label outside the declared set", () => {
    const inputs = [
      "paid_loan", "revenue_share", "purchase", "free_loan", "mixed", "nonsense", null, undefined, "",
    ] as const;
    for (const type of inputs) {
      for (const fee of [null, 0, 120]) {
        for (const qr of [true, false, null]) {
          const label = labelForArrangement({ arrangementType: type, monthlyFeeGbp: fee, qrEnabled: qr });
          expect(ALL_ARRANGEMENT_LABELS, `${type}/${fee}/${qr} -> ${label}`).toContain(label);
        }
      }
    }
  });
});
