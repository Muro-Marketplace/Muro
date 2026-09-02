import { describe, expect, it } from "vitest";
import { grepFiles, read } from "./claims-helpers";

// Launch audit. Each entry is a claim the site made that it could not
// evidence, pinned so it cannot come back.
describe("public claims the site cannot evidence stay out", () => {
  it("no page says venues are looking for art 'right now'", () => {
    for (const p of [
      "src/app/page.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/spaces/page.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/looking for art right now|Venues Looking for Art|actively seeking|Active Demand/i);
    }
  });

  it("grepFiles distinguishes no-match from a real grep error", () => {
    expect(grepFiles("zz-no-such-needle-zz", ["src/lib"])).toEqual([]);
    expect(() => grepFiles("x", ["no-such-dir-zz"])).toThrow(/grep failed/);
  });

  it("artist-facing pages do not say 'cancel any time' (the agreement needs 30 days' notice)", () => {
    for (const p of [
      "src/app/(pages)/pricing/page.tsx",
      "src/app/(pages)/apply/page.tsx",
      "src/app/(pages)/artists/page.tsx",
      "src/components/ArtistPricingCards.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/how-it-works/HowItWorksClient.tsx",
      "src/components/ApplicationForm.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/cancel any ?time/i);
    }
  });

  it("no page claims reach 'across the UK'", () => {
    expect(grepFiles("across the UK", ["src/app", "src/components"])).toEqual([]);
  });

  it("the buyer FAQ does not promise reviews or identity checks the platform lacks", () => {
    expect(read("src/components/marketing/CustomerGuide.tsx")).not.toMatch(/and reviews|verify identity/i);
  });

  it("the pricing cards match the tier perks (Pro is Featured; Premium and Pro get Artwork of the Week)", () => {
    const cards = read("src/components/ArtistPricingCards.tsx");
    expect(cards).not.toMatch(/Featured artist profile and badge/);
    expect((cards.match(/Artwork of the Week/g) || []).length).toBe(2);
    expect(cards).toMatch(/Featured artist: your profile leads the marketplace/);
  });

  it("the billing upgrade panel and application form sell the same tier perks (Finding 4)", () => {
    for (const p of [
      "src/app/(pages)/artist-portal/billing/page.tsx",
      "src/components/ApplicationForm.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/featured profile/i);
      expect(src, p).toMatch(/Artwork of the Week/);
    }
  });

  it("venue photo captions name a type, never an invented place", () => {
    expect(read("src/components/marketing/VenueGuide.tsx")).not.toMatch(
      /caption: "[^"]*, (Peckham|Bermondsey|Hackney|Margate|Shoreditch|Camberwell|Islington|Deptford)"/,
    );
  });

  it("artist rent copy uses the stint length, not twelve months on one wall", () => {
    const pricing = read("src/app/(pages)/pricing/page.tsx");
    expect(pricing).not.toMatch(/PROGRAMME_PIECE_RENT_TARGET_GBP \* 12/);
    expect(pricing).toMatch(/PROGRAMME_PIECE_STINT_MONTHS/);
    expect(read("src/app/(pages)/artist-agreement/page.tsx")).toMatch(/9A\. Programme Rent/);
  });
});
