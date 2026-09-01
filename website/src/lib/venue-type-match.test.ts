import { describe, expect, it } from "vitest";
import { matchesVenueType } from "./venue-type-match";

describe("matchesVenueType", () => {
  it("finds the live values the exact-match filter missed", () => {
    // These three shapes are all in production and were unfilterable.
    expect(matchesVenueType("Café / Coffee Shop", "Café")).toBe(true);
    expect(matchesVenueType("Restaurant / Bar", "Restaurant")).toBe(true);
    expect(matchesVenueType("Hotel / Hospitality", "Hotel")).toBe(true);
  });

  it("still matches the plain values", () => {
    expect(matchesVenueType("Café", "Café")).toBe(true);
    expect(matchesVenueType("Restaurant", "Restaurant")).toBe(true);
  });

  it("ignores accents and case, which venues type inconsistently", () => {
    expect(matchesVenueType("cafe", "Café")).toBe(true);
    expect(matchesVenueType("CAFÉ / Coffee", "café")).toBe(true);
  });

  it("does not match unrelated types", () => {
    expect(matchesVenueType("Restaurant / Bar", "Café")).toBe(false);
    expect(matchesVenueType("Gallery", "Hotel")).toBe(false);
  });

  it("'All' matches everything, including an unset type", () => {
    expect(matchesVenueType("Café", "All")).toBe(true);
    expect(matchesVenueType(null, "All")).toBe(true);
  });

  it("a venue with no type is excluded from a specific filter, not crashed on", () => {
    expect(matchesVenueType(null, "Café")).toBe(false);
    expect(matchesVenueType("", "Café")).toBe(false);
  });
});
