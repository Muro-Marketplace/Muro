import { afterEach, describe, expect, it } from "vitest";
import { shopUrl, shopUrlDisplay } from "./shop-url";

const SNAPSHOT = { ...process.env };
afterEach(() => {
  process.env = { ...SNAPSHOT };
});

describe("shopUrl()", () => {
  it("builds the vanity URL, not the /browse one", () => {
    // /browse/{slug} stays canonical for search engines. This is the one an
    // artist puts in their bio, so it is the short form.
    process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
    expect(shopUrl("fin-coles")).toBe("https://wallplace.co.uk/fin-coles");
  });

  it("falls back to the production origin when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(shopUrl("fin-coles")).toBe("https://wallplace.co.uk/fin-coles");
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.wallplace.co.uk/";
    expect(shopUrl("fin-coles")).toBe("https://staging.wallplace.co.uk/fin-coles");
  });

  it("follows the configured origin on a preview deploy", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.vercel.app";
    expect(shopUrl("fin-coles")).toBe("https://preview.vercel.app/fin-coles");
  });
});

describe("shopUrlDisplay()", () => {
  it("drops the scheme, which is noise on a bio line", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
    expect(shopUrlDisplay("fin-coles")).toBe("wallplace.co.uk/fin-coles");
  });

  it("drops a trailing slash too", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk/";
    expect(shopUrlDisplay("fin-coles")).toBe("wallplace.co.uk/fin-coles");
  });
});
