// Covers test #13 from docs/security/AUDIT.md §3.4:
//   13. Rate limiter blocks 6th login in 15 min
//
// These tests exercise the in-memory fallback path (UPSTASH_* unset).
// Production uses the Redis-backed path, which is the library's
// responsibility to correctly implement, worth integration-testing
// once we have Upstash credentials wired in CI.

import { beforeEach, describe, expect, it } from "vitest";
import { _resetInMemoryStore, checkRateLimit, getIP, withRateLimit } from "./rate-limit";

function request(url: string, ip = "1.2.3.4"): Request {
  return new Request(url, { headers: { "x-forwarded-for": ip } });
}

describe("getIP()", () => {
  it("prefers x-forwarded-for (first entry)", () => {
    const r = new Request("http://x.com", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(getIP(r)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip", () => {
    const r = new Request("http://x.com", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getIP(r)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no headers present", () => {
    expect(getIP(new Request("http://x.com"))).toBe("unknown");
  });
});

describe("checkRateLimit(), in-memory fallback", () => {
  beforeEach(() => _resetInMemoryStore());

  it("allows requests up to the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(request("http://x.com/login"), 5, 60_000);
      expect(r).toBeNull();
    }
  });

  it("blocks the (limit+1)th request with 429", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit(request("http://x.com/login"), 5, 60_000);
    const blocked = await checkRateLimit(request("http://x.com/login"), 5, 60_000);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("includes a Retry-After header", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(request("http://x.com/login"), 2, 60_000);
    const blocked = await checkRateLimit(request("http://x.com/login"), 2, 60_000);
    expect(blocked!.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("separates different IPs", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit(request("http://x.com/login", "1.1.1.1"), 5, 60_000);
    // Different IP should get its own bucket.
    const other = await checkRateLimit(request("http://x.com/login", "2.2.2.2"), 5, 60_000);
    expect(other).toBeNull();
  });

  it("separates different paths on the same IP", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit(request("http://x.com/login"), 5, 60_000);
    const otherPath = await checkRateLimit(request("http://x.com/signup"), 5, 60_000);
    expect(otherPath).toBeNull();
  });
});

describe("withRateLimit(), named rules", () => {
  beforeEach(() => _resetInMemoryStore());

  it("blocks after `limit` calls with the same key", async () => {
    const rule = { name: "login", limit: 3, windowSeconds: 60, key: "1.2.3.4:me@x.com" };
    for (let i = 0; i < 3; i++) {
      expect(await withRateLimit(request("http://x.com/"), rule)).toBeNull();
    }
    const blocked = await withRateLimit(request("http://x.com/"), rule);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("different rule names keep separate buckets", async () => {
    const login = { name: "login", limit: 1, windowSeconds: 60, key: "ip" };
    const signup = { name: "signup", limit: 1, windowSeconds: 60, key: "ip" };
    expect(await withRateLimit(request("http://x.com/"), login)).toBeNull();
    expect(await withRateLimit(request("http://x.com/"), signup)).toBeNull();
    // Same key within `login` is now blocked.
    expect(await withRateLimit(request("http://x.com/"), login)).not.toBeNull();
  });

  it("falls back to IP when key isn't provided", async () => {
    const rule = { name: "checkout", limit: 1, windowSeconds: 60 };
    expect(await withRateLimit(request("http://x.com/", "9.9.9.9"), rule)).toBeNull();
    expect(await withRateLimit(request("http://x.com/", "9.9.9.9"), rule)).not.toBeNull();
    // A different IP is a different bucket.
    expect(await withRateLimit(request("http://x.com/", "8.8.8.8"), rule)).toBeNull();
  });
});
