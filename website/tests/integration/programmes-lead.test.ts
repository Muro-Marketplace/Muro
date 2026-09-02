import { describe, expect, it } from "vitest";
import { grepFiles } from "./public-claims.test";

// Launch audit, section 02. Programmes is the product the business needs to
// sell, and the prose kept naming Curated as the example paid option.
describe("Programmes leads the paid pitch", () => {
  it("no public copy names Curated as the example paid service", () => {
    expect(grepFiles("such as Wallplace Curated", ["src/app", "src/components"])).toEqual([]);
  });

  it("no public copy offers Curated as the 'or explore' alternative", () => {
    expect(grepFiles("explore Curated", ["src/app", "src/components"])).toEqual([]);
  });
});
