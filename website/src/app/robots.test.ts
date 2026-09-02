import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots()", () => {
  it("disallows every internal route", () => {
    const config = robots();
    const rule = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    const disallow = rule.disallow as string[];
    for (const path of [
      "/api/",
      "/admin/",
      "/artist-portal/",
      "/venue-portal/",
      "/customer-portal/",
      "/checkout/",
      "/reset-password/",
      "/forgot-password/",
      "/placements/",
      "/email-preview/",
      "/dev/",
      "/auth/",
      "/check-your-inbox/",
    ]) {
      expect(disallow).toContain(path);
    }
  });
});
