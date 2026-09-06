// The chrome moved from the 50 portal pages into each portal's layout.tsx.
// One page never had it and must not gain it: the venue wall editor, a
// full-bleed visualiser surface that sizes against the viewport and carries
// its own top bar. The artist showroom scene editor was the other, until the
// showroom was removed.
import { describe, it, expect } from "vitest";
import { isFullBleedPortalPath } from "./portal-nav";

describe("isFullBleedPortalPath", () => {
  it("matches the scene editor", () => {
    expect(isFullBleedPortalPath("/venue-portal/walls/wall-9")).toBe(true);
  });

  it("does not match the listing above it", () => {
    expect(isFullBleedPortalPath("/venue-portal/walls")).toBe(false);
  });

  it("does not match the static `new` sibling, which keeps the chrome", () => {
    expect(isFullBleedPortalPath("/venue-portal/walls/new")).toBe(false);
  });

  it("ignores query strings, hashes and trailing slashes", () => {
    expect(isFullBleedPortalPath("/venue-portal/walls/w1?tab=works")).toBe(true);
    expect(isFullBleedPortalPath("/venue-portal/walls/w1/")).toBe(true);
    expect(isFullBleedPortalPath("/venue-portal/walls/new/")).toBe(false);
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
    expect(isFullBleedPortalPath("/venue-portal/walls/w1/edit")).toBe(false);
  });

  // The showroom is gone: its editor path must not resolve to a full-bleed
  // surface, or the removed route would still be special-cased by the layout.
  it("no longer treats the removed showroom editor as full-bleed", () => {
    expect(isFullBleedPortalPath("/artist-portal/showroom/abc-123")).toBe(false);
  });
});
