import { describe, it, expect } from "vitest";
import { canViewSpaceDetails } from "./gating";

describe("canViewSpaceDetails()", () => {
  it("blocks anonymous visitors", () => {
    expect(
      canViewSpaceDetails({ viewerType: null, isSubscribed: false }),
    ).toBe(false);
  });

  it("blocks non-subscribed artists", () => {
    expect(
      canViewSpaceDetails({ viewerType: "artist", isSubscribed: false }),
    ).toBe(false);
  });

  it("allows artists with active subscription", () => {
    expect(
      canViewSpaceDetails({ viewerType: "artist", isSubscribed: true }),
    ).toBe(true);
  });

  it("allows customers regardless of subscription", () => {
    expect(
      canViewSpaceDetails({ viewerType: "customer", isSubscribed: false }),
    ).toBe(true);
    expect(
      canViewSpaceDetails({ viewerType: "customer", isSubscribed: true }),
    ).toBe(true);
  });

  it("blocks venues from viewing other venues", () => {
    expect(
      canViewSpaceDetails({ viewerType: "venue", isSubscribed: true }),
    ).toBe(false);
    expect(
      canViewSpaceDetails({ viewerType: "venue", isSubscribed: false }),
    ).toBe(false);
  });

  it("allows a venue to view ITS OWN venue page", () => {
    expect(
      canViewSpaceDetails({
        viewerType: "venue",
        isSubscribed: false,
        isOwnVenue: true,
      }),
    ).toBe(true);
  });

  it("ignores isOwnVenue for non-venue viewers", () => {
    // Edge case: a stray isOwnVenue=true shouldn't promote a
    // non-subscribed artist past the subscription gate.
    expect(
      canViewSpaceDetails({
        viewerType: "artist",
        isSubscribed: false,
        isOwnVenue: true,
      }),
    ).toBe(false);
  });

  it("always allows admins", () => {
    expect(
      canViewSpaceDetails({ viewerType: "admin", isSubscribed: false }),
    ).toBe(true);
  });
});
