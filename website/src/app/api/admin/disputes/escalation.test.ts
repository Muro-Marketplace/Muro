// G20. The escalation flag rides on `disputes.category` because the table has
// no flag column and this pass adds no migrations. That only works if the
// encoding is lossless and idempotent, which is what these pin down.

import { describe, expect, it } from "vitest";
import { ESCALATED_PREFIX, baseCategory, isEscalated, markEscalated } from "./escalation";

describe("markEscalated", () => {
  it("keeps the classification the opener filed under", () => {
    expect(markEscalated("damaged")).toBe("escalated: damaged");
    expect(baseCategory(markEscalated("damaged"))).toBe("damaged");
  });

  it("is idempotent, so escalating twice does not stack prefixes", () => {
    const once = markEscalated("damaged");
    expect(markEscalated(once)).toBe(once);
    expect(markEscalated(markEscalated(once))).toBe(once);
  });

  it("still flags a dispute filed with no category at all", () => {
    expect(markEscalated(null)).toBe(ESCALATED_PREFIX);
    expect(markEscalated("")).toBe(ESCALATED_PREFIX);
    expect(baseCategory(markEscalated(null))).toBe("");
  });
});

describe("isEscalated / baseCategory", () => {
  it("reads an unescalated category through untouched", () => {
    expect(isEscalated("damaged")).toBe(false);
    expect(baseCategory("damaged")).toBe("damaged");
  });

  it("handles a null or missing category", () => {
    expect(isEscalated(null)).toBe(false);
    expect(isEscalated(undefined)).toBe(false);
    expect(baseCategory(null)).toBe("");
  });

  it("does not mistake a category that merely mentions escalation", () => {
    // Only the prefix counts. "needs escalated review" is a classification.
    expect(isEscalated("needs escalated review")).toBe(false);
    expect(baseCategory("needs escalated review")).toBe("needs escalated review");
  });
});
