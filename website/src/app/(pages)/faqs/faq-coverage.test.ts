import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Launch audit, section 05: questions a buyer asks that the site did not answer.
describe("FAQ coverage", () => {
  it("answers physical theft, not only image theft", () => {
    expect(read("src/app/(pages)/faqs/page.tsx")).toMatch(/In a venue: if a piece goes missing/);
  });

  it("says who installs on a Programme", () => {
    expect(read("src/app/(pages)/faqs/page.tsx")).toMatch(/On a Wallplace Programme, installation is included/);
  });

  it("the Programmes FAQ covers installer, lead time and end of term", () => {
    const src = read("src/app/(pages)/programmes/ProgrammesClient.tsx");
    expect(src).toMatch(/Who installs, and what if something gets damaged\?/);
    expect(src).toMatch(/How long from quote to art on the walls\?/);
    expect(src).toMatch(/What happens at the end of the term\?/);
  });
});
