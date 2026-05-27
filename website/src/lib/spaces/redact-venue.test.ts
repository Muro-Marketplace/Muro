import { describe, it, expect } from "vitest";
import {
  redactVenueForListing,
  redactVenueDetail,
  type DemandVenuePublic,
  type VenueDetailRow,
} from "./redact-venue";

const sampleListing: DemandVenuePublic = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  type: "Café",
  location: "London",
  coordinates: { lat: 51.5, lng: -0.1 },
  wallSpace: "Three walls",
  approximateFootfall: "500/day",
  preferredStyles: ["abstract", "minimalist"],
  preferredThemes: ["nature"],
  interestedInFreeLoan: true,
  interestedInRevenueShare: true,
  interestedInDirectPurchase: false,
  description: "A cosy café in Shoreditch with...",
  image: "https://cdn.example.com/copper-kettle/hero.jpg",
  images: [
    "https://cdn.example.com/copper-kettle/hero.jpg",
    "https://cdn.example.com/copper-kettle/2.jpg",
  ],
  displayWallSpace: "2m by 1m brick wall",
  displayLighting: "Warm overhead",
  displayInstallNotes: "Picture rail at 2m",
  displayRotationFrequency: "Quarterly",
};

describe("redactVenueForListing()", () => {
  it("blanks the protected fields", () => {
    const out = redactVenueForListing(sampleListing);
    expect(out.name).toBe("");
    expect(out.description).toBe("");
    expect(out.image).toBe("");
    expect(out.images).toEqual([]);
    expect(out.displayWallSpace).toBe("");
    expect(out.displayLighting).toBe("");
    expect(out.displayInstallNotes).toBe("");
    expect(out.displayRotationFrequency).toBe("");
  });

  it("preserves the teaser fields the listing card shows openly", () => {
    const out = redactVenueForListing(sampleListing);
    expect(out.slug).toBe("copper-kettle");
    expect(out.type).toBe("Café");
    expect(out.location).toBe("London");
    expect(out.coordinates).toEqual({ lat: 51.5, lng: -0.1 });
    expect(out.wallSpace).toBe("Three walls");
    expect(out.approximateFootfall).toBe("500/day");
    expect(out.preferredStyles).toEqual(["abstract", "minimalist"]);
    expect(out.preferredThemes).toEqual(["nature"]);
    expect(out.interestedInFreeLoan).toBe(true);
    expect(out.interestedInRevenueShare).toBe(true);
    expect(out.interestedInDirectPurchase).toBe(false);
  });

  it("returns a new object (does not mutate input)", () => {
    const out = redactVenueForListing(sampleListing);
    expect(out).not.toBe(sampleListing);
    expect(sampleListing.name).toBe("The Copper Kettle");
  });
});

const sampleDetail: VenueDetailRow = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  type: "Café",
  location: "London",
  city: "London",
  postcode: "EC2A",
  wall_space: "Three walls",
  description: "A cosy café in Shoreditch with...",
  image: "https://cdn.example.com/copper-kettle/hero.jpg",
  images: [
    "https://cdn.example.com/copper-kettle/hero.jpg",
    "https://cdn.example.com/copper-kettle/2.jpg",
  ],
  approximate_footfall: "500/day",
  audience_type: "young professionals",
  interested_in_free_loan: true,
  interested_in_revenue_share: true,
  interested_in_direct_purchase: false,
  preferred_styles: ["abstract"],
  preferred_themes: ["nature"],
  display_wall_space: "2m by 1m",
  display_lighting: "warm",
  display_install_notes: "picture rail",
  display_rotation_frequency: "quarterly",
};

describe("redactVenueDetail()", () => {
  it("blanks the protected fields", () => {
    const out = redactVenueDetail(sampleDetail);
    expect(out.name).toBe("");
    expect(out.description).toBe("");
    expect(out.image).toBeNull();
    expect(out.images).toEqual([]);
    expect(out.display_wall_space).toBeNull();
    expect(out.display_lighting).toBeNull();
    expect(out.display_install_notes).toBeNull();
    expect(out.display_rotation_frequency).toBeNull();
  });

  it("preserves the teaser fields", () => {
    const out = redactVenueDetail(sampleDetail);
    expect(out.slug).toBe("copper-kettle");
    expect(out.type).toBe("Café");
    expect(out.city).toBe("London");
    expect(out.postcode).toBe("EC2A");
    expect(out.wall_space).toBe("Three walls");
    expect(out.approximate_footfall).toBe("500/day");
    expect(out.preferred_styles).toEqual(["abstract"]);
    expect(out.preferred_themes).toEqual(["nature"]);
  });
});
