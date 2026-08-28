import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signQrAttribution, verifyQrAttribution } from "./qr-attribution-token";

// D10. The venue attribution for a QR sale must be a server-signed claim, not a
// raw slug the client can assert, or a venue operator could divert an artist's
// revenue share on a sale that never came through their QR.

beforeEach(() => {
  process.env.ORDER_TOKEN_SECRET = "test-secret-not-for-prod";
});
afterEach(() => {
  delete process.env.ORDER_TOKEN_SECRET;
});

describe("qr attribution token", () => {
  it("round-trips a valid claim", async () => {
    const token = await signQrAttribution({ venueSlug: "kings-arms", artistSlug: "Alice" });
    const claim = await verifyQrAttribution(token);
    expect(claim.venueSlug).toBe("kings-arms");
    expect(claim.artistSlug).toBe("alice"); // lower-cased at signing
    expect(claim.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered venue slug", async () => {
    const token = await signQrAttribution({ venueSlug: "small-cafe", artistSlug: "alice" });
    const [body, sig] = token.split(".");
    // Forge a different venue in the payload, keep the old signature.
    const forgedBody = Buffer.from(
      JSON.stringify({ venueSlug: "big-gallery", artistSlug: "alice", exp: 9_999_999_999 }),
    )
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await expect(verifyQrAttribution(`${forgedBody}.${sig}`)).rejects.toThrow(/bad signature/);
    // The genuine token still verifies.
    expect((await verifyQrAttribution(`${body}.${sig}`)).venueSlug).toBe("small-cafe");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signQrAttribution({ venueSlug: "kings-arms", artistSlug: "alice" });
    process.env.ORDER_TOKEN_SECRET = "a-different-secret";
    await expect(verifyQrAttribution(token)).rejects.toThrow(/bad signature/);
  });

  it("rejects an expired token", async () => {
    const token = await signQrAttribution({ venueSlug: "kings-arms", artistSlug: "alice", ttlSeconds: -1 });
    await expect(verifyQrAttribution(token)).rejects.toThrow(/expired/);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyQrAttribution("not-a-token")).rejects.toThrow(/malformed/);
    await expect(verifyQrAttribution("a.b.c")).rejects.toThrow(/malformed/);
  });

  it("throws when ORDER_TOKEN_SECRET is unset", async () => {
    delete process.env.ORDER_TOKEN_SECRET;
    await expect(signQrAttribution({ venueSlug: "x", artistSlug: "y" })).rejects.toThrow(
      /ORDER_TOKEN_SECRET/,
    );
  });
});
