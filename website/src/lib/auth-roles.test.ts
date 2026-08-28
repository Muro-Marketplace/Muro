import { describe, expect, it } from "vitest";
import {
  ALLOWED_ROLES,
  SIGNUP_ROLES,
  isRole,
  isSignupRole,
  parseRole,
  portalPathForRole,
  type UserRole,
} from "./auth-roles";

describe("ALLOWED_ROLES", () => {
  it("contains exactly the four supported roles", () => {
    expect(ALLOWED_ROLES).toEqual(["artist", "venue", "customer", "admin"]);
  });
});

describe("isRole()", () => {
  it("accepts every allowed role", () => {
    for (const r of ALLOWED_ROLES) {
      expect(isRole(r)).toBe(true);
    }
  });

  it.each([null, undefined, "", "ARTIST", "owner", 42, {}, [], true])(
    "rejects %p",
    (input) => {
      expect(isRole(input)).toBe(false);
    },
  );
});

describe("parseRole()", () => {
  it("returns the role when valid", () => {
    expect(parseRole("artist")).toBe<UserRole>("artist");
  });

  it("returns null for unknown values rather than throwing", () => {
    expect(parseRole("hacker")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole(123)).toBeNull();
  });
});

describe("portalPathForRole()", () => {
  it.each([
    ["admin", "/admin"],
    ["venue", "/venue-portal"],
    ["customer", "/customer-portal"],
    ["artist", "/artist-portal"],
  ] as const)("%s -> %s", (role, path) => {
    expect(portalPathForRole(role)).toBe(path);
  });

  it("falls back to /browse for null", () => {
    expect(portalPathForRole(null)).toBe("/browse");
  });
});

// E35d — a user-suppliable role can never be "admin".
//
// `ALLOWED_ROLES` had admin in the same list as the three public roles, and
// `api/auth/oauth-sign-state` validated a user-supplied body field against it.
// The asymmetry below is the fix and it must stay asymmetric.
describe("isSignupRole (E35d)", () => {
  it("rejects admin, which isRole accepts", () => {
    // Reading a stored value still has to accept "admin", or portalPathForRole
    // and the admin sidebar break for real admins. Accepting one as INPUT is
    // what was wrong.
    expect(isRole("admin")).toBe(true);
    expect(isSignupRole("admin")).toBe(false);
  });

  it("accepts the three roles a person can actually sign up as", () => {
    for (const role of ["artist", "venue", "customer"]) {
      expect(isSignupRole(role), role).toBe(true);
    }
  });

  it("rejects anything that is not one of those three", () => {
    for (const value of ["Admin", "ADMIN", "superuser", "", null, undefined, 1, {}, ["artist"]]) {
      expect(isSignupRole(value), String(value)).toBe(false);
    }
  });

  it("keeps SIGNUP_ROLES a strict subset of ALLOWED_ROLES", () => {
    // A role you can request must still be a role the app can read back.
    for (const role of SIGNUP_ROLES) {
      expect(ALLOWED_ROLES as readonly string[]).toContain(role);
    }
    expect(SIGNUP_ROLES as readonly string[]).not.toContain("admin");
  });
});
