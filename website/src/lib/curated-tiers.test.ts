import { describe, it, expect } from "vitest";
import { CURATED_TIERS, curatedTierFooterNote } from "./curated-tiers";

// E38. The /curated/[tier] footer used to print "cancel any time" under
// every tier, including the one-off payments (Single wall, Full space,
// Bespoke) where there is no subscription and nothing to cancel. That is a
// false term of sale on a purchase-decision surface. The note is now
// conditional on the tier group; this file stops it regressing.
//
// Wallplace Programmes plan: the managed group's only member is now the
// quoted `programme` tier (a twelve month term, not a self-serve
// subscription), so "cancel any time" would be an equally false term of sale
// in the other direction. Neither live group promises unconditional
// cancellation today; these tests pin what each group actually promises.
describe("curatedTierFooterNote (E38)", () => {
  it("describes the managed tier as a quoted, termed arrangement, not cancel any time", () => {
    const note = curatedTierFooterNote("managed");
    expect(note).toBe("quoted per site, on a twelve month term.");
    expect(note.toLowerCase()).not.toContain("cancel");
  });

  it("describes one-off tiers as a one-off payment, never a cancellable one", () => {
    const note = curatedTierFooterNote("one_off");
    expect(note).toBe("a one-off payment, no subscription.");
    expect(note.toLowerCase()).not.toContain("cancel");
  });

  it("no live tier promises unconditional cancellation", () => {
    for (const tier of CURATED_TIERS) {
      const note = curatedTierFooterNote(tier.group).toLowerCase();
      expect(note, tier.key).not.toContain("cancel");
    }
  });

  it("only the one-off tiers in the live tier set describe a one-off payment", () => {
    for (const tier of CURATED_TIERS) {
      const note = curatedTierFooterNote(tier.group).toLowerCase();
      if (tier.group === "one_off") {
        expect(note, tier.key).toContain("one-off payment");
      } else {
        expect(note, tier.key).not.toContain("one-off payment");
      }
    }
  });
});
