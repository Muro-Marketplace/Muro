import { describe, expect, it } from "vitest";
import { FOUNDING_ARTIST_LIMIT, FOUNDING_TRIAL_MONTHS, trialOffer } from "./pricing";

describe("trialOffer", () => {
  it("promises founding artists the long trial, derived from the constants", () => {
    const o = trialOffer(true);
    expect(o.headline).toContain(`${FOUNDING_TRIAL_MONTHS} months free`);
    expect(o.detail).toContain(`first ${FOUNDING_ARTIST_LIMIT} artists`);
    expect(o.detail).toContain("cancel at any time");
    expect(o.short).toBe(`${FOUNDING_TRIAL_MONTHS} months free, then billing starts. Cancel anytime.`);
  });

  it("promises everyone else the first month free", () => {
    const o = trialOffer(false);
    expect(o.headline).toBe("Your first month is free");
    expect(o.detail).toContain("Billing starts only once that month is complete");
    expect(o.short).toBe("First month free, then billing starts. Cancel anytime.");
  });

  it("never uses dashes or emojis in the copy", () => {
    for (const o of [trialOffer(true), trialOffer(false)]) {
      for (const text of [o.headline, o.detail, o.short]) {
        expect(text).not.toMatch(/[\u2014\u2013]|--/);
      }
    }
  });
});
