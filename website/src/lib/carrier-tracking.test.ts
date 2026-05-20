import { describe, expect, it } from "vitest";
import { detectCarrierUrl } from "./carrier-tracking";

describe("detectCarrierUrl()", () => {
  it("returns null for empty / unknown formats", () => {
    expect(detectCarrierUrl("")).toBeNull();
    expect(detectCarrierUrl("ABCD1234")).toBeNull();
    expect(detectCarrierUrl(undefined)).toBeNull();
    expect(detectCarrierUrl(null)).toBeNull();
  });

  it("matches a Royal Mail tracking number (AB123456789GB)", () => {
    const url = detectCarrierUrl("AB123456789GB");
    expect(url).toContain("royalmail.com/track-your-item");
    expect(url).toContain("AB123456789GB");
  });

  it("matches a UPS 1Z…", () => {
    const url = detectCarrierUrl("1Z999AA10123456784");
    expect(url).toContain("ups.com/track");
  });

  it("matches a FedEx 12-digit number", () => {
    const url = detectCarrierUrl("123456789012");
    expect(url).toContain("fedex.com/fedextrack");
  });

  it("matches a DHL 10-digit number", () => {
    const url = detectCarrierUrl("1234567890");
    expect(url).toContain("dhl.com/en/express/tracking");
  });
});
