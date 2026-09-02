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
      expect(src).not.toMatch(/first month free/i);
    });
  }
});

// Final review, Finding 3 (2026-09-02): five more surfaces said "first
// month free" in ways that contradict the founding offer above, without
// being artist-facing marketing pages that need to render the full offer
// themselves (a legal agreement, a pricing card's small print, the waitlist
// page, the portal dashboard and billing page). ArtistGuide.tsx was also
// on that list but is already covered above (it renders FOUNDING_OFFER_SHORT
// and gets the same negative check), so it is not repeated here.
const OTHER_SURFACES_WITHOUT_THE_OFFER = [
  "src/app/(pages)/artist-agreement/page.tsx",
  "src/components/ArtistPricingCards.tsx",
  "src/app/waitlist/page.tsx",
  "src/app/(pages)/artist-portal/page.tsx",
  "src/app/(pages)/artist-portal/billing/page.tsx",
  "src/components/ArtworkRequestsList.tsx",
  "src/components/PortalGuard.tsx",
];

describe("first-month-free copy does not resurface on other surfaces", () => {
  for (const p of OTHER_SURFACES_WITHOUT_THE_OFFER) {
    it(`${p} drops the blanket claim`, () => {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src).not.toMatch(/first month free/i);
    });
  }
});
