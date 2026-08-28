import { describe, expect, it } from "vitest";
import { buildVenueOptions, resolveVenueParam } from "./venue-options";

// QA flag D16: labels lost venue attribution because the dropdown carried
// display names only. These lock the (name, slug) pairing and the deep-link
// resolution that emails (slug) and portal links (name) both rely on.

describe("buildVenueOptions", () => {
  it("pairs the display name with the slug, deduplicating by slug", () => {
    const out = buildVenueOptions([
      { venue: "The Curzon", venue_slug: "the-curzon" },
      { venue: "The Curzon", venue_slug: "the-curzon" },
      { venue: "Roots", venue_slug: "roots-bermondsey" },
    ]);
    expect(out).toEqual([
      { name: "The Curzon", slug: "the-curzon" },
      { name: "Roots", slug: "roots-bermondsey" },
    ]);
  });

  it("keeps a slugless legacy row (name-only compat) and drops nameless rows", () => {
    const out = buildVenueOptions([
      { venue: "Old Venue", venue_slug: null },
      { venue: null, venue_slug: "ghost" },
      { venue: undefined },
    ]);
    expect(out).toEqual([{ name: "Old Venue", slug: null }]);
  });
});

describe("resolveVenueParam", () => {
  const options = [
    { name: "The Curzon", slug: "the-curzon" },
    { name: "Roots", slug: "roots-bermondsey" },
  ];

  it("matches an email deep link by slug", () => {
    expect(resolveVenueParam(options, "the-curzon")).toEqual(options[0]);
  });

  it("matches a portal deep link by display name, case-insensitively", () => {
    expect(resolveVenueParam(options, "roots")).toEqual(options[1]);
  });

  it("prefers the slug match when a name collides with another venue's slug", () => {
    const tricky = [
      { name: "the-curzon", slug: "somewhere-else" },
      { name: "The Curzon", slug: "the-curzon" },
    ];
    expect(resolveVenueParam(tricky, "the-curzon")).toEqual(tricky[1]);
  });

  it("returns null for no param or no match", () => {
    expect(resolveVenueParam(options, null)).toBeNull();
    expect(resolveVenueParam(options, "unknown")).toBeNull();
  });
});
