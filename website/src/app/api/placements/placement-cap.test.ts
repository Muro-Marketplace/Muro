import { describe, expect, it } from "vitest";
import { placementCapDecision } from "./placement-cap";

describe("placementCapDecision", () => {
  it("blocks an accept when the artist is at their plan cap", () => {
    const d = placementCapDecision({
      profile: { subscription_plan: "core", subscription_status: "active" },
      activeCount: 2,
    });
    expect(d.allowed).toBe(false);
    expect(d.cap).toBe(2);
  });

  it("allows under the cap and always for Pro", () => {
    expect(
      placementCapDecision({
        profile: { subscription_plan: "core", subscription_status: "active" },
        activeCount: 1,
      }).allowed,
    ).toBe(true);
    expect(
      placementCapDecision({
        profile: { subscription_plan: "pro", subscription_status: "active" },
        activeCount: 40,
      }).allowed,
    ).toBe(true);
  });

  it("treats a dead subscription as Core", () => {
    const d = placementCapDecision({
      profile: { subscription_plan: "pro", subscription_status: "canceled" },
      activeCount: 2,
    });
    expect(d.allowed).toBe(false);
  });
});
