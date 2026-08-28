// The caller's IP address, for rate limiting, abuse controls and audit rows.
//
// E36c. This used to read `x-forwarded-for` and take the left-most entry.
// XFF is an *append* header — every proxy adds to the right, none overwrites —
// so its left-most entry is whatever the client typed. A different value per
// request put every request in a fresh bucket and defeated the limiter on
// every rate-limited endpoint, including the login and forgot-password gates.
// It also forged the terms-of-service acceptance audit IP and the unique-
// visitor metric.
//
// So: only headers the platform sets on the way in are trusted, and there is
// no fall-back to a client-supplied one. Adding a header is free for an
// attacker; removing one the edge inserted is not.
//
// Production is fronted by Vercel directly, verified 2026-08-28 — `server:
// Vercel` on https://www.wallplace.co.uk with no `cf-ray`. Doc 03 §5.3 left
// this UNCONFIRMED and proposed trying `cf-connecting-ip` first; that would
// have reintroduced the exact bug, because with no Cloudflare in front that
// header is entirely client-supplied. It is deliberately not read.

const PLATFORM_HEADERS = [
  // Set by Vercel's edge on every inbound request.
  "x-vercel-forwarded-for",
  // Also set by the platform proxy. Second because it is a conventional name
  // that a future non-Vercel front might forward rather than set.
  "x-real-ip",
] as const;

/** Returned when no platform header identified the caller. */
export const UNKNOWN_IP = "unknown";

let warnedUnknown = false;

/**
 * The client IP, or `UNKNOWN_IP` when no trusted header identified one.
 *
 * `UNKNOWN_IP` is a single shared bucket, so a deployment where the platform
 * header is missing collapses all callers together. That is the correct
 * failure direction for a limiter, but it is also an outage, so it warns once
 * in production rather than failing silently.
 */
export function getClientIp(source: Request | Headers): string {
  const headers = source instanceof Headers ? source : source.headers;

  for (const name of PLATFORM_HEADERS) {
    const value = headers.get(name);
    if (value) {
      // These carry a single address in practice; split defensively so a
      // list can never smuggle a second value into the key.
      const first = value.split(",")[0].trim();
      if (first) return first;
    }
  }

  if (!warnedUnknown && process.env.NODE_ENV === "production") {
    warnedUnknown = true;
    console.warn(
      `[client-ip] No platform IP header present (${PLATFORM_HEADERS.join(", ")}). ` +
        "Every caller now shares the 'unknown' rate-limit bucket, which will 429 " +
        "legitimate traffic. Check what fronts production and add its header here.",
    );
  }
  return UNKNOWN_IP;
}

/** Test-only: reset the one-shot production warning. */
export function _resetClientIpWarning() {
  warnedUnknown = false;
}
