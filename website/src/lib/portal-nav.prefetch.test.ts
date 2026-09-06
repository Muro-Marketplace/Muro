// The sidebar warms a page's data on hover, so the click joins a request that
// is already in flight instead of starting one.
import { describe, it, expect } from "vitest";
import { artistPortalNav, flattenPortalNav, prefetchUrlsFor } from "./portal-nav";

describe("prefetchUrlsFor", () => {
  it("names the endpoint a page needs immediately", () => {
    expect(prefetchUrlsFor("/artist-portal/orders")).toEqual(["/api/orders"]);
    expect(prefetchUrlsFor("/artist-portal/enquiries")).toEqual(["/api/enquiry"]);
  });

  it("can warm more than one, for a page that needs two to render", () => {
    expect(prefetchUrlsFor("/artist-portal/analytics")).toEqual(["/api/orders", "/api/placements"]);
  });

  it("ignores query strings and trailing slashes the way the nav does", () => {
    expect(prefetchUrlsFor("/artist-portal/orders?id=123")).toEqual(["/api/orders"]);
    expect(prefetchUrlsFor("/artist-portal/orders/")).toEqual(["/api/orders"]);
  });

  it("returns nothing for a page with no immediate fetch, rather than throwing", () => {
    expect(prefetchUrlsFor("/artist-portal/settings")).toEqual([]);
    expect(prefetchUrlsFor("/not-a-portal-page")).toEqual([]);
  });

  it("only ever names portal API routes", () => {
    // A typo here would silently warm the wrong thing on every hover.
    for (const item of flattenPortalNav(artistPortalNav())) {
      for (const url of prefetchUrlsFor(item.href)) {
        expect(url, `${item.href} -> ${url}`).toMatch(/^\/api\//);
      }
    }
  });
});
