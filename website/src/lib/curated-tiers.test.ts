import { describe, it, expect } from "vitest";
import { CURATED_TIERS, curatedTierFooterNote } from "./curated-tiers";

// E38. The /curated/[tier] footer used to print "cancel any time" under
// every tier, including the one-off payments (Single wall, Full space,
// Bespoke) where there is no subscription and nothing to cancel. That is a
// false term of sale on a purchase-decision surface. The note is now
// conditional on the tier group; this file stops it regressing.
describe("curatedTierFooterNote (E38)", () => {
  it("keeps the cancellation promise on the managed tiers", () => {
    expect(curatedTierFooterNote("managed")).toBe("cancel any time.");
  });

  it("describes one-off tiers as a one-off payment, never a cancellable one", () => {
    const note = curatedTierFooterNote("one_off");
    expect(note).toBe("a one-off payment, no subscription.");
    expect(note.toLowerCase()).not.toContain("cancel");
  });

  it("only the managed tiers in the live tier set ever say cancel", () => {
    for (const tier of CURATED_TIERS) {
      const note = curatedTierFooterNote(tier.group);
      if (tier.group === "managed") {
        expect(note, tier.key).toContain("cancel");
      } else {
        expect(note.toLowerCase(), tier.key).not.toContain("cancel");
      }
    }
  });
});
