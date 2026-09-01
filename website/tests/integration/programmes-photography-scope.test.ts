import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Nav-broadening plan. Ten new photography assets landed at
// public/images/programmes/ for one purpose: /curated and /programmes,
// the two paid "done for you" pages, per an explicit owner instruction.
//
// one-curated-price-source.test.ts pins what /curated and /programmes must
// derive their prices from. This is the other direction: it pins what the
// homepage, /venues, /artists, /spaces, and the two shared marketing
// components (VenueGuide, ArtistGuide) must NOT reference, so the new
// assets cannot quietly leak onto pages that were told to stay untouched.
const FORBIDDEN_FILES = [
  "src/app/page.tsx",
  "src/app/(pages)/venues/page.tsx",
  "src/app/(pages)/artists/page.tsx",
  "src/app/(pages)/spaces/page.tsx",
  "src/components/marketing/VenueGuide.tsx",
  "src/components/marketing/ArtistGuide.tsx",
];

describe("the new /curated + /programmes photography stays out of other pages", () => {
  for (const relPath of FORBIDDEN_FILES) {
    it(`${relPath} does not reference images/programmes`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      expect(source).not.toMatch(/images\/programmes/);
    });
  }
});
