import { describe, expect, it } from "vitest";
import { PLAN_FEATURES, planFeaturesFor } from "./plan-features";
import { WORKS_CAP, ACTIVE_PLACEMENT_CAP } from "./pricing";
import { OUTREACH_WEEKLY_LIMIT } from "./outreach-cap";

describe("PLAN_FEATURES", () => {
  it("quotes the enforced caps rather than hand-typed numbers", () => {
    expect(PLAN_FEATURES.core).toContain(`Up to ${WORKS_CAP.core} works in your portfolio`);
    expect(PLAN_FEATURES.premium).toContain(`Up to ${WORKS_CAP.premium} works in your portfolio`);
    expect(PLAN_FEATURES.pro).toContain(`Up to ${WORKS_CAP.pro} works in your portfolio`);
    expect(PLAN_FEATURES.core).toContain(`Approach ${OUTREACH_WEEKLY_LIMIT.core} new venues a week`);
    expect(PLAN_FEATURES.premium).toContain(`Approach ${OUTREACH_WEEKLY_LIMIT.premium} new venues a week`);
    expect(PLAN_FEATURES.pro).toContain(`Approach ${OUTREACH_WEEKLY_LIMIT.pro} new venues a week`);
    expect(PLAN_FEATURES.core).toContain(
      `Up to ${ACTIVE_PLACEMENT_CAP.core} active venue placements at a time`,
    );
  });

  it("carries the tier perks the public-claims guard checks on the pricing cards", () => {
    const all = Object.values(PLAN_FEATURES).flat().join("\n");
    expect(all).toMatch(/Featured artist: your profile leads the marketplace/);
    expect((all.match(/Artwork of the Week/g) || []).length).toBe(2);
    expect((all.match(/Priority visibility in venue recommendations/g) || []).length).toBe(2);
  });

  it("uses no dashes as punctuation, because the list is public copy", () => {
    for (const line of Object.values(PLAN_FEATURES).flat()) {
      expect(line).not.toMatch(/[–—]|--/);
    }
  });
});

describe("planFeaturesFor()", () => {
  it("accepts a key or a display name", () => {
    expect(planFeaturesFor("premium")).toEqual([...PLAN_FEATURES.premium]);
    expect(planFeaturesFor("Premium")).toEqual([...PLAN_FEATURES.premium]);
    expect(planFeaturesFor(" Pro ")).toEqual([...PLAN_FEATURES.pro]);
  });

  it("reads an unknown or missing plan as Core", () => {
    expect(planFeaturesFor("enterprise")).toEqual([...PLAN_FEATURES.core]);
    expect(planFeaturesFor(null)).toEqual([...PLAN_FEATURES.core]);
    expect(planFeaturesFor(undefined)).toEqual([...PLAN_FEATURES.core]);
  });

  it("returns a copy, so a caller cannot mutate the shared list", () => {
    const list = planFeaturesFor("core");
    list.push("something extra");
    expect(PLAN_FEATURES.core).not.toContain("something extra");
  });
});
