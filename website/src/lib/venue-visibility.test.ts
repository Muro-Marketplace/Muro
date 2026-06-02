import { describe, expect, it } from "vitest";
import {
  canSeeVenueIdentity,
  redactDemandVenue,
  redactVenueDetail,
} from "./venue-visibility";

describe("canSeeVenueIdentity", () => {
  it("denies anonymous callers", () => {
    expect(canSeeVenueIdentity(null, false)).toBe(false);
    expect(canSeeVenueIdentity(undefined, false)).toBe(false);
  });

  it("denies venues looking at other venues even when subscribed", () => {
    expect(canSeeVenueIdentity("venue", true)).toBe(false);
  });

  it("allows customers without a subscription", () => {
    expect(canSeeVenueIdentity("customer", false)).toBe(true);
  });

  it("allows subscribed artists", () => {
    expect(canSeeVenueIdentity("artist", true)).toBe(true);
  });

  it("denies unsubscribed artists", () => {
    expect(canSeeVenueIdentity("artist", false)).toBe(false);
  });
});

describe("redactDemandVenue", () => {
  const full = {
    slug: "the-copper-kettle",
    name: "The Copper Kettle",
    type: "Cafe",
    location: "London",
    description: "A cosy spot",
    image: "https://x/y.png",
    images: ["https://x/1.png"],
    displayInstallNotes: "Hang at eye level",
    interestedInRevenueShare: true,
  };

  it("blanks identity but keeps the demand signal for non-entitled callers", () => {
    const r = redactDemandVenue(full, false);
    expect(r.name).toBe("");
    expect(r.description).toBe("");
    expect(r.image).toBe("");
    expect(r.images).toEqual([]);
    expect(r.displayInstallNotes).toBe("");
    // demand signal preserved
    expect(r.type).toBe("Cafe");
    expect(r.location).toBe("London");
    expect(r.interestedInRevenueShare).toBe(true);
  });

  it("returns the row untouched for entitled callers", () => {
    expect(redactDemandVenue(full, true)).toEqual(full);
  });
});

describe("redactVenueDetail", () => {
  it("nulls the postcode for non-entitled callers but keeps public fields", () => {
    const r = redactVenueDetail(
      { slug: "x", name: "X", description: "d", postcode: "E8 1AA" },
      false,
    );
    expect(r.postcode).toBeNull();
    expect(r.name).toBe("X");
    expect(r.description).toBe("d");
  });

  it("keeps the postcode for entitled callers", () => {
    const r = redactVenueDetail({ slug: "x", postcode: "E8 1AA" }, true);
    expect(r.postcode).toBe("E8 1AA");
  });
});
