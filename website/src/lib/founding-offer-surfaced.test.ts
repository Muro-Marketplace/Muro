import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Launch audit, section 04. The offer is built, admin-capped and printed on
// the flyer; the site said "first month free" everywhere. Every artist-facing
// page renders it from src/lib/pricing.ts so the numbers cannot drift.
const PAGES = [
  "src/app/page.tsx",
  "src/app/(pages)/artists/page.tsx",
  "src/app/(pages)/pricing/page.tsx",
  "src/app/(pages)/apply/page.tsx",
  "src/app/(pages)/how-it-works/HowItWorksClient.tsx",
  "src/components/marketing/ArtistGuide.tsx",
  "src/components/ApplicationForm.tsx",
];

describe("the founding-artist offer is on every artist-facing page", () => {
  for (const p of PAGES) {
    it(`${p} renders it from pricing.ts and drops the blanket claim`, () => {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src).toMatch(/FOUNDING_OFFER_SHORT|foundingOfferLine\(\)/);
      expect(src).not.toMatch(/First month free on all plans/);
    });
  }
});
