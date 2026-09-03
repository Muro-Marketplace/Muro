// Bug 1 / G-A. public-artist.test.ts proves the projection; this proves the
// anonymous endpoint actually applies it. The projection existing but not being
// wired in is the failure mode worth a separate test.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAllArtistsMock, rateLimitMock } = vi.hoisted(() => ({
  getAllArtistsMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/db/merged-data", () => ({ getAllArtists: getAllArtistsMock }));
const { showroomCountsMock } = vi.hoisted(() => ({ showroomCountsMock: vi.fn(async () => ({}) as Record<string, number>) }));
vi.mock("@/lib/artists/showroom", () => ({ getShowroomWallCountsBySlug: showroomCountsMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));

import { GET } from "./route";

const ARTIST = {
  slug: "maya-chen",
  name: "Maya Chen",
  location: "Hampton, London",
  postcode: "TW12 2TH",
  coordinates: { lat: 51.418123, lng: -0.366789 },
};

beforeEach(() => {
  getAllArtistsMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(null);
  getAllArtistsMock.mockResolvedValue([ARTIST]);
});

const get = () => GET(new Request("http://localhost/api/browse-artists"));

describe("GET /api/browse-artists (Bug 1)", () => {
  it("publishes no postcode", async () => {
    const body = await (await get()).json();
    expect(body.artists[0]).not.toHaveProperty("postcode");
    expect(JSON.stringify(body)).not.toContain("TW12");
  });

  it("publishes coarsened coordinates, not the exact fix", async () => {
    const body = await (await get()).json();
    expect(body.artists[0].coordinates).toEqual({ lat: 51.42, lng: -0.37 });
    expect(JSON.stringify(body)).not.toContain("51.418123");
    expect(JSON.stringify(body)).not.toContain("0.366789");
  });

  it("still returns the fields the browse page renders", async () => {
    const body = await (await get()).json();
    expect(body.artists[0]).toMatchObject({
      slug: "maya-chen",
      name: "Maya Chen",
      location: "Hampton, London",
    });
  });

  it("still honours the rate limiter", async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const res = await get();
    expect(res.status).toBe(429);
    expect(getAllArtistsMock).not.toHaveBeenCalled();
  });

  it("still degrades to an empty list on failure", async () => {
    getAllArtistsMock.mockRejectedValue(new Error("db down"));
    const res = await get();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ artists: [] });
  });
});


describe("showroomWallCount", () => {
  it("carries each artist's public showroom wall count, zero when they have none", async () => {
    showroomCountsMock.mockResolvedValueOnce({ [ARTIST.slug]: 3 });
    let res = await GET(new Request("http://localhost/api/browse-artists"));
    let body = await res.json();
    expect(body.artists[0].showroomWallCount).toBe(3);
    showroomCountsMock.mockResolvedValueOnce({});
    res = await GET(new Request("http://localhost/api/browse-artists"));
    body = await res.json();
    expect(body.artists[0].showroomWallCount).toBe(0);
  });
});
