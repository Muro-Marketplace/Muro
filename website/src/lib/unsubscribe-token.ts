// HMAC signature for unsubscribe links.
//
// The unsubscribe endpoint is anonymous by design: RFC 8058 one-click has to
// work without a session, and unsubscribing is a legal obligation, so it can
// never be gated behind a login. The route's own header explains the trust
// model as "the link is the bearer, and anyone holding it has read the inbox
// it was delivered to".
//
// The link did not earn that. It carried the recipient's raw user_id and
// nothing else, so the bearer was really the UUID, and a UUID is not a
// secret in the way a signed token is: it appears in API responses, in
// support threads, in logs. Anyone who ever learns one can unsubscribe that
// person from anything, without ever seeing the email. Verified against
// production on 2026-08-30, an unauthenticated GET carrying nothing but a
// real user_id turned that account's newsletter off.
//
// This is distinct from C24, which fixed the page-side prefetch problem by
// requiring a button press. That protects the visible link in the footer.
// It does not make the id a credential.
//
// Signing makes the claim true. `s` is an HMAC of the user id, so possession
// of the id alone proves nothing and only a link we actually sent verifies.
//
// Deliberately no expiry. Unsubscribe links sit in inboxes for years and
// must keep working; an expiring one would fail the obligation it exists to
// meet. The signature binds who, not when.
//
// Mirrors qr-attribution-token.ts and order-tracking-token.ts, and reuses
// ORDER_TOKEN_SECRET.

import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const s = process.env.ORDER_TOKEN_SECRET;
  if (!s) throw new Error("ORDER_TOKEN_SECRET is not configured");
  return s;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Whether links can be signed at all.
 *
 * ORDER_TOKEN_SECRET is optional in env.ts, so a deployment may not have it.
 * Callers must not enforce a signature they were unable to produce: doing so
 * would reject every link in every email, and an unsubscribe link that does
 * nothing fails an obligation we do not get to opt out of. Enforce only where
 * signing is possible, and say so loudly where it is not.
 */
export function unsubscribeSigningConfigured(): boolean {
  return Boolean(process.env.ORDER_TOKEN_SECRET);
}

/** Signature for an unsubscribe link's `u` parameter. */
export function signUnsubscribe(userId: string): string {
  return base64url(createHmac("sha256", getSecret()).update(`unsubscribe:${userId}`).digest());
}

/**
 * True when `signature` was produced by us for `userId`.
 *
 * Never throws, so a caller can treat an unconfigured secret or a malformed
 * signature the same way it treats a wrong one: as unverified. Returning
 * false on a missing secret is the safe direction, because the caller's
 * unverified path is the more cautious one, not the more permissive one.
 */
export function verifyUnsubscribe(
  userId: string | null | undefined,
  signature: string | null | undefined,
): boolean {
  if (!userId || !signature) return false;
  let expected: string;
  try {
    expected = signUnsubscribe(userId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on a length mismatch, which is itself a signal, so
  // check the length first and only then compare in constant time.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
