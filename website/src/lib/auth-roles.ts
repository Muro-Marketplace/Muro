// src/lib/auth-roles.ts
//
// Single source of truth for the four user roles Wallplace supports.
// Every place that reads `user_metadata.user_type` MUST go through
// parseRole() so a corrupt / unexpected value never propagates.

export const ALLOWED_ROLES = ["artist", "venue", "customer", "admin"] as const;

export type UserRole = (typeof ALLOWED_ROLES)[number];

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ALLOWED_ROLES as readonly string[]).includes(value);
}

export function parseRole(value: unknown): UserRole | null {
  return isRole(value) ? value : null;
}

/**
 * The roles a user may ASK for, at signup or through OAuth. Never includes
 * "admin": admin is granted server-side only (ADR 0008).
 *
 * E35d. `ALLOWED_ROLES` had admin in the same list as the three public roles,
 * and `api/auth/oauth-sign-state` validated a user-supplied body field against
 * it, so `POST {"role":"admin"}` to an unauthenticated route minted a validly
 * HMAC-signed state token claiming admin. `oauth-finalize` declared a narrower
 * list of its own and then never used it: the value was cast, not checked.
 *
 * The asymmetry with `isRole` is deliberate and must stay. Reading a stored
 * value still has to accept "admin", or `portalPathForRole` and the sidebar
 * break for real admins. Accepting one as INPUT is the thing that was wrong.
 */
export const SIGNUP_ROLES = ["artist", "venue", "customer"] as const;

export type SignupRole = (typeof SIGNUP_ROLES)[number];

export function isSignupRole(value: unknown): value is SignupRole {
  return typeof value === "string" && (SIGNUP_ROLES as readonly string[]).includes(value);
}

/**
 * The portal path a user lands on after a successful auth event.
 * Centralised so login and signup pages stay in sync.
 */
export function portalPathForRole(role: UserRole | null): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "venue":
      return "/venue-portal";
    case "customer":
      return "/customer-portal";
    case "artist":
      return "/artist-portal";
    default:
      return "/browse";
  }
}
