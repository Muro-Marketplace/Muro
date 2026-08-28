// 04's open question 2, answered: the API version is pinned.
//
// An unset `apiVersion` does not mean "latest". It means the version configured
// on the Stripe ACCOUNT applies, so the shapes every handler reads were decided
// in a dashboard rather than in this repository, and a bump there would change
// them with no code change, no deploy and no review.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// The client is constructed at module scope, so importing this module without a
// key throws. Every other test mocks @/lib/stripe; this one is about the real
// module, so it supplies a dummy key and imports dynamically.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_for_version_pin";

async function pinnedVersion(): Promise<string> {
  return (await import("./stripe")).STRIPE_API_VERSION;
}

describe("the Stripe API version is pinned", () => {
  it("matches the version the installed SDK is built for", async () => {
    // The real guard is the type: `apiVersion` is a single string literal in
    // the installed SDK, so a package bump without this line fails typecheck.
    // This asserts the same thing at runtime, and names the reason, so the
    // literal above is not mistaken for an arbitrary date somebody typed.
    const sdk = readFileSync(
      path.resolve(__dirname, "../../node_modules/stripe/cjs/apiVersion.js"),
      "utf8",
    );
    const match = sdk.match(/ApiVersion\s*=\s*['"]([^'"]+)['"]/);

    expect(match, "could not read the SDK's own ApiVersion").not.toBeNull();
    expect(await pinnedVersion()).toBe(match![1]);
  });

  it("is a real dated version, not a placeholder", async () => {
    expect(await pinnedVersion()).toMatch(/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/);
  });

  it("is actually passed to the client, not merely exported", () => {
    // Exporting the constant and forgetting to pass it would leave the account
    // default in force while the file claims otherwise.
    const source = readFileSync(path.resolve(__dirname, "stripe.ts"), "utf8");
    expect(source).toMatch(/apiVersion:\s*STRIPE_API_VERSION/);
  });
});
