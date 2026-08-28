import { describe, it, expect, afterEach } from "vitest";
import { isEmailPreviewAllowed } from "./access";

// B4: /email-preview was reachable unauthenticated in production. It renders every
// template in the registry, so it exposes the full transactional-email surface,
// wording and structure included, to anyone who guesses the path. The page's own
// header comment admitted it: "Not gated behind auth, add a check here or in
// middleware if you want to restrict it in production."
//
// The gate FAILS CLOSED. src/env.ts defaults NEXT_PUBLIC_SITE_URL to
// https://wallplace.co.uk, so an unset or unrecognised value must read as
// production, not as "probably fine".

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

function withEnv(env: Record<string, string | undefined>): boolean {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return isEmailPreviewAllowed();
}

describe("isEmailPreviewAllowed", () => {
  it("allows local development", () => {
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_ENV: undefined })).toBe(true);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3099", VERCEL_ENV: undefined })).toBe(true);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000", VERCEL_ENV: undefined })).toBe(true);
  });

  it("allows a Vercel preview or development deploy", () => {
    expect(withEnv({ VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://wallplace-abc123.vercel.app" })).toBe(true);
    expect(withEnv({ VERCEL_ENV: "development", NEXT_PUBLIC_SITE_URL: "https://wallplace-abc123.vercel.app" })).toBe(true);
  });

  it("blocks the live public site", () => {
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "https://wallplace.co.uk", VERCEL_ENV: undefined })).toBe(false);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "https://www.wallplace.co.uk", VERCEL_ENV: undefined })).toBe(false);
  });

  it("blocks a Vercel production deploy regardless of the site URL", () => {
    expect(withEnv({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe(false);
  });

  it("fails closed when the site URL is unset", () => {
    // env.ts's default is the live domain, so "unset" is not evidence of dev.
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: undefined, VERCEL_ENV: undefined })).toBe(false);
  });

  it("fails closed on any unrecognised host", () => {
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "https://staging.example.com", VERCEL_ENV: undefined })).toBe(false);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url", VERCEL_ENV: undefined })).toBe(false);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "", VERCEL_ENV: undefined })).toBe(false);
  });

  it("is not fooled by localhost appearing elsewhere in the URL", () => {
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "https://wallplace.co.uk/localhost", VERCEL_ENV: undefined })).toBe(false);
    expect(withEnv({ NEXT_PUBLIC_SITE_URL: "https://localhost.wallplace.co.uk", VERCEL_ENV: undefined })).toBe(false);
  });
});
