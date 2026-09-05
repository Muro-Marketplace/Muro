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
    expect(grepFiles("across the UK", ["src/app", "src/components", "src/emails"])).toEqual([]);
  });

  it("the buyer FAQ does not promise reviews or identity checks the platform lacks", () => {
    expect(read("src/components/marketing/CustomerGuide.tsx")).not.toMatch(/and reviews|verify identity/i);
  });

  it("the pricing cards match the tier perks (Pro is Featured; Premium and Pro get Artwork of the Week)", () => {
    // The cards render lib/plan-features (one list, shared with the
    // trial-ending email), so the perks are read from there.
    const cards = read("src/lib/plan-features.ts");
    expect(cards).not.toMatch(/Featured artist profile and badge/);
    expect((cards.match(/Artwork of the Week/g) || []).length).toBe(2);
    expect(cards).toMatch(/Featured artist: your profile leads the marketplace/);
    // Owner decision 2026-09-02: the weekly venue digest now delivers this,
    // Pro ranked first, so both tiers that get it must say so.
    expect((cards.match(/Priority visibility in venue recommendations/g) || []).length).toBe(2);
  });

  it("the billing upgrade panel and application form sell the same tier perks (Finding 4, LA-C009)", () => {
    const form = read("src/components/ApplicationForm.tsx");
    expect(form).not.toMatch(/featured profile/i);
    expect(form).toMatch(/Artwork of the Week/);
    // LA-C009: the Change Plan bullets were a third hand-written copy of the
    // perks and had drifted (they still sold "Message venues directly", which is
    // no longer a plan feature). They now render planFeaturesFor(), the one list.
    const billing = read("src/app/(pages)/artist-portal/billing/page.tsx");
    expect(billing).toMatch(/planFeaturesFor\(/);
    expect(billing).not.toMatch(/Message venues directly|<li>Dedicated support<\/li>|<li>Up to 8 works<\/li>/);
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

  it("the pricing comparison table reads the venue-approach cap from OUTREACH_WEEKLY_LIMIT (LA-C029)", () => {
    const pricing = read("src/app/(pages)/pricing/page.tsx");
    expect(pricing).not.toMatch(/"\d+ a week"/);
    expect(pricing).toMatch(/OUTREACH_WEEKLY_LIMIT\.core\} a week/);
    expect(pricing).toMatch(/OUTREACH_WEEKLY_LIMIT\.pro\} a week/);
  });

  it("the pricing comparison table gives Featured to Pro only (LA-C028)", () => {
    const pricing = read("src/app/(pages)/pricing/page.tsx");
    expect(pricing).not.toMatch(/premium: "Featured"/);
    expect(pricing).toMatch(/pro: "Featured"/);
  });

  it("the pricing hero does not say the tiers differ by platform fee (LA-C027)", () => {
    expect(read("src/app/(pages)/pricing/page.tsx")).not.toMatch(/difference\s+is visibility and the platform fee/);
  });

  it("the FAQ does not promise lower platform fees on higher tiers (LA-C023)", () => {
    expect(read("src/app/(pages)/faqs/page.tsx")).not.toMatch(/lower platform\s+fees/);
  });

  it("venue copy does not say there is no contract when the FAQ and agreement say there is one (LA-C047)", () => {
    for (const p of ["src/components/marketing/VenueGuide.tsx", "src/app/page.tsx"]) {
      expect(read(p), p).not.toMatch(/No contracts?\./);
    }
    expect(read("src/components/marketing/VenueGuide.tsx")).not.toMatch(/answer:\s*"No\. Just a simple partnership agreement/);
  });

  it("nothing renders a limited-company name while company.ts has no registration (LA-C030)", () => {
    // Tests that simulate incorporation set the name themselves; only shipped code counts.
    const shipped = grepFiles("Wallplace Ltd", ["src/app", "src/components", "src/emails", "src/lib"]).filter((f) => !/\.test\.tsx?$/.test(f));
    expect(shipped).toEqual([]);
  });

  it("the billing page spells cancelled the British way (LA-C010)", () => {
    expect(read("src/app/(pages)/artist-portal/billing/page.tsx")).not.toMatch(/"Canceled"|has been canceled/);
  });

  it("the venue dashboard has no em dash in its copy (LA-C084)", () => {
    expect(read("src/app/(pages)/venue-portal/page.tsx")).not.toMatch(/—|\\u2014/);
  });

  it("the QR label help copy does not use a hyphen as a dash (LA-C064, LA-C081)", () => {
    for (const p of ["src/app/(pages)/artist-portal/labels/page.tsx", "src/app/(pages)/venue-portal/labels/page.tsx"]) {
      expect(read(p), p).not.toMatch(/printed card - the QR code/);
    }
  });

  it("the terms dispute steps have no space before the colon (LA-C080)", () => {
    expect(read("src/app/(pages)/terms/page.tsx")).not.toMatch(/Step \d :/);
  });
});
