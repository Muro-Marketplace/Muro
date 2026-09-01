import { describe, expect, it } from "vitest";
import { CHECK_INBOX_PATH, signupDestination } from "./signup-destination";

describe("signupDestination", () => {
  // A L447, A L458. All three sign-up pages pushed /check-your-inbox
  // unconditionally. Email confirmation is off in production, so the new
  // account was already signed in and the page it was sent to was untrue.
  it("goes where the signup was headed when a session came back", () => {
    expect(signupDestination({ session: { access_token: "t" } }, "/browse")).toBe("/browse");
    expect(signupDestination({ session: { access_token: "t" } }, "/venue-portal")).toBe("/venue-portal");
  });

  it("sends them to the inbox page when confirmation is required", () => {
    // Supabase returns a null session when the project requires confirmation.
    expect(signupDestination({ session: null }, "/browse")).toBe(CHECK_INBOX_PATH);
  });

  it("defaults to the inbox page when the response cannot be read", () => {
    // Being told to check your email unnecessarily is recoverable. Being
    // dropped on a portal you are not signed in to is not.
    for (const bad of [null, undefined, {}]) {
      expect(signupDestination(bad as never, "/browse")).toBe(CHECK_INBOX_PATH);
    }
  });

  it("does not invent a destination of its own", () => {
    // `next` has already been through safeRedirect; this must pass it through
    // untouched rather than second-guess it.
    expect(signupDestination({ session: {} }, "/apply")).toBe("/apply");
  });
});
