import { describe, expect, it } from "vitest";
import {
  ANY_DISTANCE,
  DEFAULT_MAX_DISTANCE,
  parseLocationParams,
  serializeLocationParams,
} from "./locationParams";

describe("parseLocationParams()", () => {
  it("returns the anywhere default when input is null/undefined", () => {
    expect(parseLocationParams(null)).toEqual({
      coords: null,
      label: "",
      maxDistance: DEFAULT_MAX_DISTANCE,
    });
    expect(parseLocationParams(undefined)).toEqual({
      coords: null,
      label: "",
      maxDistance: DEFAULT_MAX_DISTANCE,
    });
  });

  it("returns the anywhere default for an empty URLSearchParams", () => {
    expect(parseLocationParams(new URLSearchParams())).toEqual({
      coords: null,
      label: "",
      maxDistance: DEFAULT_MAX_DISTANCE,
    });
  });

  it("parses a postcode-style location with all params present", () => {
    const sp = new URLSearchParams("loc_lat=51.52&loc_lng=-0.10&loc_label=EC1A+1BB&maxDistance=10");
    expect(parseLocationParams(sp)).toEqual({
      coords: { lat: 51.52, lng: -0.1 },
      label: "EC1A 1BB",
      maxDistance: 10,
    });
  });

  it("uses DEFAULT_MAX_DISTANCE when maxDistance is omitted", () => {
    const sp = new URLSearchParams("loc_lat=51.5&loc_lng=-0.1");
    expect(parseLocationParams(sp).maxDistance).toBe(DEFAULT_MAX_DISTANCE);
  });

  it("treats a half-set lat/lng pair as anywhere (no crash)", () => {
    const sp = new URLSearchParams("loc_lat=51.5");
    expect(parseLocationParams(sp).coords).toBeNull();
  });

  it("treats malformed numeric coords as anywhere", () => {
    const sp = new URLSearchParams("loc_lat=not-a-number&loc_lng=-0.1");
    expect(parseLocationParams(sp).coords).toBeNull();
  });

  it("falls back to default for negative / non-finite maxDistance", () => {
    const a = new URLSearchParams("loc_lat=51&loc_lng=-0.1&maxDistance=-5");
    expect(parseLocationParams(a).maxDistance).toBe(DEFAULT_MAX_DISTANCE);
    const b = new URLSearchParams("loc_lat=51&loc_lng=-0.1&maxDistance=NaN");
    expect(parseLocationParams(b).maxDistance).toBe(DEFAULT_MAX_DISTANCE);
  });

  it("ignores loc_label when no coords are set", () => {
    // Stale label without coords from a manual URL edit; treat as anywhere.
    const sp = new URLSearchParams("loc_label=EC1A+1BB");
    expect(parseLocationParams(sp)).toEqual({
      coords: null,
      label: "",
      maxDistance: DEFAULT_MAX_DISTANCE,
    });
  });

  it("accepts ANY_DISTANCE (9999) as a valid maxDistance", () => {
    const sp = new URLSearchParams(`loc_lat=51&loc_lng=-0.1&maxDistance=${ANY_DISTANCE}`);
    expect(parseLocationParams(sp).maxDistance).toBe(ANY_DISTANCE);
  });
});

describe("serializeLocationParams()", () => {
  it("strips all location keys when coords is null (anywhere)", () => {
    const current = new URLSearchParams("view=collections&loc_lat=51&loc_lng=-0.1&maxDistance=50&loc_label=foo");
    const out = serializeLocationParams(
      { coords: null, label: "", maxDistance: DEFAULT_MAX_DISTANCE },
      current,
    );
    expect(out.has("loc_lat")).toBe(false);
    expect(out.has("loc_lng")).toBe(false);
    expect(out.has("loc_label")).toBe(false);
    expect(out.has("maxDistance")).toBe(false);
    // Non-location params are preserved.
    expect(out.get("view")).toBe("collections");
  });

  it("writes coords, label, and a non-default maxDistance", () => {
    const out = serializeLocationParams(
      { coords: { lat: 51.52, lng: -0.1 }, label: "EC1A 1BB", maxDistance: 10 },
      new URLSearchParams("view=portfolios"),
    );
    expect(out.get("loc_lat")).toBe("51.52");
    expect(out.get("loc_lng")).toBe("-0.1");
    expect(out.get("loc_label")).toBe("EC1A 1BB");
    expect(out.get("maxDistance")).toBe("10");
    expect(out.get("view")).toBe("portfolios");
  });

  it("omits maxDistance from the URL when it equals the default", () => {
    const out = serializeLocationParams(
      { coords: { lat: 51, lng: -0.1 }, label: "X", maxDistance: DEFAULT_MAX_DISTANCE },
      new URLSearchParams(),
    );
    expect(out.has("maxDistance")).toBe(false);
  });

  it("drops loc_label when label is empty (e.g. geolocation w/o name)", () => {
    const out = serializeLocationParams(
      { coords: { lat: 51, lng: -0.1 }, label: "", maxDistance: DEFAULT_MAX_DISTANCE },
      new URLSearchParams("loc_label=stale"),
    );
    expect(out.has("loc_label")).toBe(false);
  });

  it("does not mutate the input URLSearchParams", () => {
    const current = new URLSearchParams("view=collections");
    serializeLocationParams(
      { coords: { lat: 51, lng: -0.1 }, label: "X", maxDistance: 50 },
      current,
    );
    expect(current.toString()).toBe("view=collections");
  });

  it("round-trips through parse → serialize → parse", () => {
    const start = new URLSearchParams("view=portfolios&loc_lat=51.5&loc_lng=-0.1&loc_label=EC1A+1BB&maxDistance=10");
    const parsed = parseLocationParams(start);
    const serialized = serializeLocationParams(parsed, new URLSearchParams("view=portfolios"));
    const reparsed = parseLocationParams(serialized);
    expect(reparsed).toEqual(parsed);
    expect(serialized.get("view")).toBe("portfolios");
  });
});
