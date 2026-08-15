// 09 §A.6 layer 1 (item 0.1). The boot assertion itself runs once per server
// start and throws, which a test cannot drive directly, so the decision it makes
// lives in missingEmailEnv() and is tested here.

import { describe, expect, it } from "vitest";
import { REQUIRED_EMAIL_ENV, missingEmailEnv, isProductionRuntime } from "./env";

const FULL = {
  RESEND_API_KEY: "re_123",
  EMAIL_FROM_TX: "noreply@tx.wallplace.co.uk",
  EMAIL_FROM_NOTIFY: "hello@tx.wallplace.co.uk",
  EMAIL_FROM_NEWS: "news@tx.wallplace.co.uk",
  CRON_SECRET: "s3cret",
};

describe("missingEmailEnv", () => {
  it("returns nothing when every required key is set", () => {
    expect(missingEmailEnv(FULL)).toEqual([]);
  });

  it("names each absent key, in declaration order", () => {
    const { RESEND_API_KEY: _a, EMAIL_FROM_NEWS: _b, ...rest } = FULL;
    expect(missingEmailEnv(rest)).toEqual(["RESEND_API_KEY", "EMAIL_FROM_NEWS"]);
  });

  it("treats a blank value as missing", () => {
    // Vercel lets you save an empty value, and a blank API key fails exactly
    // like an absent one while looking set in the dashboard.
    expect(missingEmailEnv({ ...FULL, RESEND_API_KEY: "" })).toEqual(["RESEND_API_KEY"]);
    expect(missingEmailEnv({ ...FULL, CRON_SECRET: "   " })).toEqual(["CRON_SECRET"]);
  });

  it("covers the cron secret, because the digest crons are email senders too", () => {
    expect(REQUIRED_EMAIL_ENV).toContain("CRON_SECRET");
  });
});

describe("isProductionRuntime", () => {
  it("is true only for VERCEL_ENV=production", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});
