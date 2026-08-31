// Svix signature verification for the Resend webhook (WS5.2, R4.4).
//
// Resend signs webhooks with svix. The signed content is
// `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256 under the
// base64-decoded secret (after stripping the `whsec_` prefix), base64-encoded
// and offered space-delimited as `v1,<sig>` entries in the svix-signature
// header. Implemented with node:crypto rather than pulling in the svix SDK
// for one HMAC. Lives outside the route file because App Router route modules
// may only export handlers, and the tests need to import this directly.

import crypto from "node:crypto";

/** Replay defence: reject events whose svix-timestamp strays beyond this. */
export const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * True only when one of the header's `v1` signatures matches our own HMAC of
 * the signed content and the timestamp is within tolerance.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > SVIX_TIMESTAMP_TOLERANCE_SECONDS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");

  // The header carries one or more space-delimited `version,signature` pairs
  // (key rotation sends two). Any matching v1 signature accepts.
  return headers.signature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const [version, sig] = part.split(",", 2);
      return version === "v1" && typeof sig === "string" && timingSafeEqual(sig, expected);
    });
}

/**
 * Sign a payload the way svix does, for tests and local poking. Not used on
 * the request path.
 */
export function signForSvix(
  rawBody: string,
  id: string,
  timestampSeconds: number,
  secret: string,
): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestampSeconds}.${rawBody}`;
  const sig = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  return `v1,${sig}`;
}
