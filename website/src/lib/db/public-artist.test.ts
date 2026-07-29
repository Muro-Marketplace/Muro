import { describe, it, expect } from "vitest";
import { toPublicArtist, PUBLIC_COORD_DECIMALS } from "./public-artist";

// Bug 1 / G-A: /api/browse-artists is anonymous and returned each artist's exact
// postcode and the GPS coordinates geocoded from it. For a solo artist working from
// home that is their home address, published to anyone who curls the endpoint.

const ARTIST = {
  slug: "maya-chen",
  name: "Maya Chen",
  location: "Hampton, London",
  postcode: "TW12 2TH",
  coordinates: { lat: 51.418123, lng: -0.366789 },
  shortBio: "Painter",
  totalViews: 12,
};

describe("toPublicArtist", () => {
  it("removes the postcode entirely", () => {
    const pub = toPublicArtist(ARTIST);
    expect(pub).not.toHaveProperty("postcode");
    expect(JSON.stringify(pub)).not.toContain("TW12");
  });

  it("coarsens the coordinates instead of publishing an exact fix", () => {
    const pub = toPublicArtist(ARTIST);
    expect(pub.coordinates).toEqual({ lat: 51.42, lng: -0.37 });
    // The exact values must not survive anywhere in the payload.
    expect(JSON.stringify(pub)).not.toContain("51.418123");
    expect(JSON.stringify(pub)).not.toContain("-0.366789");
  });

  it("keeps everything else the browse page needs", () => {
    const pub = toPublicArtist(ARTIST);
    expect(pub).toMatchObject({
      slug: "maya-chen",
      name: "Maya Chen",
      location: "Hampton, London",
      shortBio: "Painter",
      totalViews: 12,
    });
  });

  it("passes a null coordinate through as null", () => {
    expect(toPublicArtist({ ...ARTIST, coordinates: null }).coordinates).toBeNull();
  });

  it("handles an artist with no location data at all", () => {
    const bare = { slug: "x", name: "X" };
    expect(toPublicArtist(bare)).toEqual({ slug: "x", name: "X", coordinates: null });
  });

  it("keeps precision coarse enough to matter but fine enough to filter", () => {
    // The browse page's smallest radius is 5 miles (~8km), so the rounding error
    // has to stay well inside that. At 2dp a degree of latitude quantises to
    // ~1.1km, and longitude at UK latitudes to ~0.7km.
    expect(PUBLIC_COORD_DECIMALS).toBe(2);
    const kmPerDegreeLat = 111;
    const worstCaseErrorKm = (kmPerDegreeLat * 10 ** -PUBLIC_COORD_DECIMALS) / 2;
    expect(worstCaseErrorKm).toBeLessThan(1);
  });

  it("does not mutate the artist it was given", () => {
    const input = { ...ARTIST, coordinates: { ...ARTIST.coordinates } };
    toPublicArtist(input);
    expect(input.postcode).toBe("TW12 2TH");
    expect(input.coordinates).toEqual({ lat: 51.418123, lng: -0.366789 });
  });
});
