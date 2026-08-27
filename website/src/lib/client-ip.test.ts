// E36c — the rate-limit key was spoofable.
//
// `getIP` read `x-forwarded-for` and took the left-most entry. Proxies append
// to XFF, they do not overwrite it, so that entry is whatever the caller typed.
// A fresh value per request meant a fresh bucket per request, which defeats the
// limiter on every rate-limited endpoint — including the login (8/min) and
// forgot-password (3/5min) gates, both of which are IP-only.
//
// The regression test that matters is the last one in the first block: two
// requests with different spoofed XFF values but the same platform header must
// share a bucket.

import { describe, it, expect, beforeEach } from "vitest";
import { getClientIp, UNKNOWN_IP, _resetClientIpWarning } from "./client-ip";
import { _resetInMemoryStore, checkRateLimit, getIP } from "./rate-limit";

function req(headers: Record<string, string>, url = "http://x.com"): Request {
  return new Request(url, { headers });
}

beforeEach(() => {
  _resetClientIpWarning();
  _resetInMemoryStore();
});

describe("getClientIp(): only platform headers are trusted", () => {
  it("ignores x-forwarded-for entirely", () => {
    // REVERSAL. rate-limit.test.ts used to pin the opposite ("prefers
    // x-forwarded-for (first entry)", expecting 1.1.1.1) as intended
    // behaviour. It was the vulnerability, written down as a test.
    expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe(UNKNOWN_IP);
  });

  it("ignores cf-connecting-ip, which nothing sets in front of this deployment", () => {
    // Production is fronted by Vercel directly (server: Vercel, no cf-ray), so
    // a cf-connecting-ip header can only have come from the caller. Doc 03
    // §5.3 proposed reading it first; that would have left the bug in place.
    expect(getClientIp(req({ "cf-connecting-ip": "6.6.6.6" }))).toBe(UNKNOWN_IP);
  });

  it("reads x-vercel-forwarded-for", () => {
    expect(getClientIp(req({ "x-vercel-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("prefers the platform header over anything the caller sent", () => {
    const ip = getClientIp(
      req({
        "x-forwarded-for": "1.1.1.1",
        "cf-connecting-ip": "2.2.2.2",
        "x-vercel-forwarded-for": "203.0.113.7",
      }),
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("cannot be widened by smuggling a list into the platform header", () => {
    expect(getClientIp(req({ "x-vercel-forwarded-for": "203.0.113.7, 1.1.1.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("returns 'unknown' when no header identifies the caller", () => {
    expect(getClientIp(req({}))).toBe(UNKNOWN_IP);
  });

  it("accepts a bare Headers object as well as a Request", () => {
    const headers = new Headers({ "x-vercel-forwarded-for": "203.0.113.7" });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });
});

describe("the limiter can no longer be reset by rotating x-forwarded-for", () => {
  it("keeps one caller in one bucket however they vary XFF", async () => {
    // THE regression test. Before the fix each of these landed in its own
    // bucket and none of them was ever refused.
    const url = "http://x.com/api/auth/precheck";
    const results: (Response | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(
        await checkRateLimit(
          req(
            {
              "x-vercel-forwarded-for": "203.0.113.7",
              "x-forwarded-for": `10.0.0.${i}`,
            },
            url,
          ),
          3,
          60_000,
        ),
      );
    }

    expect(results.slice(0, 3).every((r) => r === null)).toBe(true);
    expect(results[3]).not.toBeNull();
    expect(results[3]!.status).toBe(429);
  });

  it("still separates genuinely different callers", async () => {
    const url = "http://x.com/api/auth/precheck";
    for (let i = 0; i < 3; i += 1) {
      expect(await checkRateLimit(req({ "x-vercel-forwarded-for": "203.0.113.7" }, url), 3)).toBeNull();
    }
    // A different real client is unaffected by the first one's exhaustion.
    expect(await checkRateLimit(req({ "x-vercel-forwarded-for": "198.51.100.4" }, url), 3)).toBeNull();
  });

  it("puts unidentifiable callers in one shared bucket", async () => {
    const url = "http://x.com/api/auth/precheck";
    for (let i = 0; i < 3; i += 1) {
      expect(await checkRateLimit(req({ "x-forwarded-for": `10.0.0.${i}` }, url), 3)).toBeNull();
    }
    const fourth = await checkRateLimit(req({ "x-forwarded-for": "10.0.0.99" }, url), 3);
    expect(fourth).not.toBeNull();
    expect(fourth!.status).toBe(429);
  });
});

describe("getIP() compatibility shim", () => {
  it("delegates to getClientIp", () => {
    expect(getIP(req({ "x-vercel-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(getIP(req({ "x-forwarded-for": "1.1.1.1" }))).toBe(UNKNOWN_IP);
  });
});
