// HMAC-signed venue attribution for QR-scan sales (D10).
//
// The checkout route used to take `venueSlug` straight from the request body. A
// real slug for a venue where the artist holds an active placement moves the
// venue's revenue share out of the artist's net, so any buyer, or any venue
// operator with a browser console, could divert an artist's money to a venue on a
// sale that never came through that venue's QR.
//
// So the QR redirect (server-side, where the venue is already resolved) mints a
// short-lived token binding the venue to the scanned artist, and checkout verifies
// it instead of trusting a raw slug. Mirrors order-tracking-token.ts and reuses
// ORDER_TOKEN_SECRET.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface QrAttribution {
  venueSlug: string;
  /** The artist whose QR was scanned; checkout only honours the claim when this
   *  artist is actually in the cart. */
  artistSlug: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function getSecret(): string {
  const s = process.env.ORDER_TOKEN_SECRET;
  if (!s) throw new Error("ORDER_TOKEN_SECRET is not configured");
  return s;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

export async function signQrAttribution(input: {
  venueSlug: string;
  artistSlug: string;
  ttlSeconds?: number;
}): Promise<string> {
  const secret = getSecret();
  const payload: QrAttribution = {
    venueSlug: input.venueSlug,
    artistSlug: input.artistSlug.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verify a token and return its claim, or throw. Signature is checked with a
 * constant-time compare before the payload is parsed, and expiry is enforced.
 */
export async function verifyQrAttribution(token: string): Promise<QrAttribution> {
  const secret = getSecret();
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("malformed token");
  const [body, sig] = parts;
  const expected = base64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("bad signature");
  const payload = JSON.parse(fromBase64url(body).toString()) as QrAttribution;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("expired");
  }
  if (!payload.venueSlug || !payload.artistSlug) throw new Error("incomplete claim");
  return payload;
}
