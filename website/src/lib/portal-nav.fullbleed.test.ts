// The chrome moved from the 50 portal pages into each portal's layout.tsx.
// Two pages never had it and must not gain it: the artist showroom scene
// editor and the venue wall editor, both full-bleed visualiser surfaces that
// size against the viewport and carry their own top bar.
import { describe, it, expect } from "vitest";
import { isFullBleedPortalPath } from "./portal-nav";

describe("isFullBleedPortalPath", () => {
  it("matches the two scene editors", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom/abc-123")).toBe(true);
    expect(isFullBleedPortalPath("/venue-portal/walls/wall-9")).toBe(true);
  });

  it("does not match the listing above them", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom")).toBe(false);
    expect(isFullBleedPortalPath("/venue-portal/walls")).toBe(false);
  });

  it("does not match the static `new` sibling, which keeps the chrome", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom/new")).toBe(false);
    expect(isFullBleedPortalPath("/venue-portal/walls/new")).toBe(false);
  });

  it("ignores query strings, hashes and trailing slashes", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom/abc?tab=works")).toBe(true);
    expect(isFullBleedPortalPath("/venue-portal/walls/w1/")).toBe(true);
    expect(isFullBleedPortalPath("/artist-portal/showroom/new/")).toBe(false);
  });

  it("leaves every other portal route alone", () => {
    for (const p of [
      "/artist-portal",
      "/artist-portal/portfolio",
      "/artist-portal/orders/order-1",
      "/venue-portal/placements",
      "/customer-portal",
      "/admin/refunds",
    ]) {
      expect(isFullBleedPortalPath(p), p).toBe(false);
    }
  });

  it("does not match deeper than one id segment", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom/abc/edit")).toBe(false);
  });
});
