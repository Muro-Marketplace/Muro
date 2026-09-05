// LA-C004 (launch audit 2026-09-05). Every portal guard bounced a signed-out
// visitor to a bare /login, so an email deep link (Pay now for an accepted
// offer, open a conversation, print labels) was lost after sign-in even though
// the login page already honours ?next= through safeRedirect. One helper builds
// the login path so the guards cannot drift apart again.

import { describe, expect, it } from "vitest";
import { loginPathWithNext } from "./login-redirect";

describe("loginPathWithNext", () => {
  it("carries the current path and query as ?next=", () => {
    expect(loginPathWithNext("/venue-portal/offers", "?pay=off_1")).toBe(
      "/login?next=%2Fvenue-portal%2Foffers%3Fpay%3Doff_1",
    );
  });

  it("carries a bare path with no query", () => {
    expect(loginPathWithNext("/artist-portal/messages", "")).toBe(
      "/login?next=%2Fartist-portal%2Fmessages",
    );
  });

  it("falls back to a bare /login when there is no usable path", () => {
    expect(loginPathWithNext(null, "")).toBe("/login");
    expect(loginPathWithNext("", "?x=1")).toBe("/login");
    expect(loginPathWithNext("/", "")).toBe("/login");
    expect(loginPathWithNext("/login", "?next=%2Fbrowse")).toBe("/login");
  });

  it("never emits a target safeRedirect would reject", () => {
    // A protocol-relative or absolute target must not be round-tripped.
    expect(loginPathWithNext("//evil.example", "")).toBe("/login");
    expect(loginPathWithNext("https://evil.example/x", "")).toBe("/login");
  });
});
