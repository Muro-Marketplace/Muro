import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("unsubscribe-token", () => {
  const original = process.env.ORDER_TOKEN_SECRET;
  beforeEach(() => {
    process.env.ORDER_TOKEN_SECRET = "test-secret-of-at-least-32-characters-long";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ORDER_TOKEN_SECRET;
    else process.env.ORDER_TOKEN_SECRET = original;
  });

  it("verifies a signature it produced", () => {
    expect(verifyUnsubscribe(USER, signUnsubscribe(USER))).toBe(true);
  });

  it("is deterministic, so a link keeps working for years", () => {
    // No expiry on purpose: unsubscribe links live in inboxes indefinitely
    // and must keep working.
    expect(signUnsubscribe(USER)).toBe(signUnsubscribe(USER));
  });

  it("does not accept one user's signature for another", () => {
    expect(verifyUnsubscribe(OTHER, signUnsubscribe(USER))).toBe(false);
  });

  it("rejects a missing signature, which is what every pre-signing link has", () => {
    expect(verifyUnsubscribe(USER, null)).toBe(false);
    expect(verifyUnsubscribe(USER, "")).toBe(false);
    expect(verifyUnsubscribe(USER, undefined)).toBe(false);
  });

  it("rejects a missing user", () => {
    expect(verifyUnsubscribe(null, signUnsubscribe(USER))).toBe(false);
    expect(verifyUnsubscribe("", "abc")).toBe(false);
  });

  it("rejects a tampered signature of the same length", () => {
    const sig = signUnsubscribe(USER);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(flipped).toHaveLength(sig.length);
    expect(verifyUnsubscribe(USER, flipped)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on a length mismatch; the guard must catch it.
    expect(() => verifyUnsubscribe(USER, "short")).not.toThrow();
    expect(verifyUnsubscribe(USER, "short")).toBe(false);
  });

  it("changes with the secret, so a leaked link dies when the secret rotates", () => {
    const before = signUnsubscribe(USER);
    process.env.ORDER_TOKEN_SECRET = "a-different-secret-of-at-least-32-chars";
    expect(verifyUnsubscribe(USER, before)).toBe(false);
  });

  it("returns false rather than throwing when the secret is unset", () => {
    // The caller's unverified path is the cautious one, so failing closed
    // here means failing towards caution, not towards permissiveness.
    delete process.env.ORDER_TOKEN_SECRET;
    expect(verifyUnsubscribe(USER, "anything")).toBe(false);
    expect(() => signUnsubscribe(USER)).toThrow(/ORDER_TOKEN_SECRET/);
  });

  it("produces a URL-safe signature", () => {
    expect(signUnsubscribe(USER)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
